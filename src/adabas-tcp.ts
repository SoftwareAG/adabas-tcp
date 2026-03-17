/*
 * Copyright © 2019-2026 Software GmbH, Darmstadt, Germany and/or its licensors
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 *
 */

import { Socket } from 'net';
import { QueueElement } from './interfaces';
import logger from './logger';

// ---------------------------------------------------------------------------
// Module-level global handler — attached once, not per instance
// ---------------------------------------------------------------------------

process.on('warning', e => logger.warn(e.stack));

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_HOST    = 'localhost';
const DEFAULT_PORT    = 49152;
const DEFAULT_TIMEOUT = 15000;

/** Byte offset in the ADATCP header that holds the total packet length. */
const HEADER_TOTAL_LEN_OFFSET = 8;

// ---------------------------------------------------------------------------
// AdabasTcp
// ---------------------------------------------------------------------------

export class AdabasTcp {
    private readonly socket: Socket;
    private readonly queue: QueueElement[] = [];

    /** Bytes received so far for the current fragmented response. */
    private bytesReceived = 0;

    /** Expected total length of the current fragmented response; null when idle. */
    private expectedLength: number | null = null;

    /** Accumulation buffer for fragmented responses. */
    private fragmentBuffer: Buffer = Buffer.alloc(0);

    constructor(host = DEFAULT_HOST, port = DEFAULT_PORT) {
        this.socket = new Socket();

        // Attach all handlers before connect so connection errors are caught
        this.socket.on('connect', () => {
            logger.debug({ host, port }, 'Client connected to');
        });

        this.socket.on('close', (hadError: boolean) => {
            logger.debug({ hadError }, 'Client closed');
        });

        this.socket.on('end', () => {
            logger.debug('Remote end of socket signaled');
            if (this.queue.length > 0) {
                this.rejectAll(new Error('Connection ended by server'));
            }
        });

        this.socket.on('timeout', () => {
            logger.debug('Socket timeout');
            const err = AdabasTcp.makeError('Socket timeout', 'ETIMEDOUT');
            this.rejectAll(err);
            this.socket.destroy(err);
        });

        this.socket.on('data', (data: Buffer) => {
            this.onData(data);
        });

        this.socket.on('error', (err: NodeJS.ErrnoException) => {
            // Typical codes: ECONNREFUSED, EHOSTUNREACH, ENETUNREACH, ECONNRESET
            logger.debug({ code: err.code, err }, 'Socket error');
            this.rejectAll(err);
        });

        this.socket.setTimeout(DEFAULT_TIMEOUT);
        this.socket.connect(port, host);
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    send(data: Buffer): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            this.queue.push({ data, resolve, reject });

            if (this.socket.destroyed) {
                // Socket is gone — reject all pending requests including this one
                this.rejectAll(AdabasTcp.makeError('Socket is destroyed', 'EDESTROYED'));
                return;
            }

            if (this.queue.length === 1) {
                try {
                    this.socket.write(data);
                } catch (err) {
                    logger.error({ err }, 'Socket write error');
                    reject(err instanceof Error ? err : new Error(String(err)));
                }
            }
        });
    }

    /**
     * Returns true when the underlying socket is still open and usable.
     * A destroyed socket cannot be written to; callers should reconnect.
     */
    isAlive(): boolean {
        return !this.socket.destroyed;
    }

    close(): void {
        logger.debug('destroy socket');
        this.socket.destroy();
    }

    // -----------------------------------------------------------------------
    // Private — data handling
    // -----------------------------------------------------------------------

    private onData(data: Buffer): void {
        if (this.expectedLength !== null) {
            // Continuation of a fragmented response
            this.fragmentBuffer  = Buffer.concat([this.fragmentBuffer, data]);
            this.bytesReceived  += data.length;

            if (this.bytesReceived >= this.expectedLength) {
                const complete = this.fragmentBuffer;
                this.resetFragmentState();
                this.resolveData(complete);
            }
            return;
        }

        const totalLength = data.readUInt32BE(HEADER_TOTAL_LEN_OFFSET);

        if (data.length < totalLength) {
            // First chunk of a fragmented response — begin accumulation
            this.expectedLength  = totalLength;
            this.bytesReceived   = data.length;
            this.fragmentBuffer  = Buffer.from(data);
        } else {
            // Complete response arrived in a single packet
            this.resolveData(data);
        }
    }

    private resolveData(data: Buffer): void {
        const element = this.queue.shift();
        element?.resolve(data);

        if (this.queue.length > 0) {
            try {
                this.socket.write(this.queue[0].data);
            } catch (err) {
                this.rejectAll(err instanceof Error ? err : new Error(String(err)));
            }
        }
    }

    private rejectAll(err: Error): void {
        while (this.queue.length > 0) {
            this.queue.shift()?.reject(err);
        }
    }

    private resetFragmentState(): void {
        this.expectedLength  = null;
        this.bytesReceived   = 0;
        this.fragmentBuffer  = Buffer.alloc(0);
    }

    // -----------------------------------------------------------------------
    // Private — utilities
    // -----------------------------------------------------------------------

    private static makeError(message: string, code: string): NodeJS.ErrnoException {
        const err: NodeJS.ErrnoException = new Error(message);
        err.code = code;
        return err;
    }
}