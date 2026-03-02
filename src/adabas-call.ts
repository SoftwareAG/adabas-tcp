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

import { AdabasBufferStructure } from './adabas-buffer-structure';
import { PayloadData } from './interfaces';
import { AdabasTcp } from './adabas-tcp';
import { expandBuffer, hexdump, padBuffer } from './common';
import { AdabasBuffer } from './adabas-buffer';
import { Abd } from './abd';
import logger from './logger';

// ---------------------------------------------------------------------------
// Log event type — only valid event names are accepted
// ---------------------------------------------------------------------------

export type LogEvent = 'before' | 'after' | 'cb';

// ---------------------------------------------------------------------------
// ADATCP wire-format constants
// ---------------------------------------------------------------------------

/** Total length of the ADATCP outer header block. */
const HEADER_LENGTH = 40;

/** Length of the DATA sub-block that follows the header. */
const DATA_BLOCK_LENGTH = 24;

/** Byte offset where the ACBX starts in the response (header + data block). */
const ACBX_OFFSET = HEADER_LENGTH + DATA_BLOCK_LENGTH;  // 64

/** Wire size of a single Adabas Buffer Descriptor (ABD). */
const ABD_SIZE = 48;

/** Maximum expected ACBX length; response is padded to this if shorter. */
const ACBX_MAX_LENGTH = 192;

/** Length of the UUID field in the header. */
const UUID_LENGTH = 16;

// Header field offsets
const HDR_EYECATCHER = 0;   // 6 bytes — 'ADATCP'
const HDR_VERSION    = 6;   // 2 bytes — '01'
const HDR_TOTAL_LEN  = 8;   // UInt32BE — total packet length
const HDR_TYPE       = 12;  // UInt32BE — packet type (7)
const HDR_UUID       = 16;  // 16 bytes — session UUID

// Data-block field offsets (relative to start of data block)
const DATA_EYECATCHER  = 0;  // 8 bytes  — 'DATA0001'
const DATA_LEN         = 8;  // UInt32LE — length excluding outer header
const DATA_REQUEST     = 12; // UInt32LE — request flag (1)
const DATA_NR_BUFFERS  = 16; // UInt32LE — number of ABDs
const DATA_ZERO        = 20; // UInt32LE — reserved, always 0

// ---------------------------------------------------------------------------
// AdabasCall
// ---------------------------------------------------------------------------

export class AdabasCall {
    private readonly client: AdabasTcp;
    private readonly log: LogEvent[];

    constructor(client: AdabasTcp, log: LogEvent[] = []) {
        this.client = client;
        this.log    = log;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    async call(payload: PayloadData): Promise<PayloadData> {
        const abdData         = payload.abda?.getBuffers() ?? [];
        const numberOfBuffers = abdData.length;

        // Compute total packet length once — shared by both the outer header
        // and the DATA sub-block length field.
        const acbxLen  = payload.cb.acbx.length;
        const abdTotal = numberOfBuffers * ABD_SIZE;
        const dataTotal = abdData.reduce((sum, e) => sum + e.buffer.length, 0);
        const totalLen  = HEADER_LENGTH + DATA_BLOCK_LENGTH + acbxLen + abdTotal + dataTotal;

        const bufferHeader = this.buildHeader(payload, totalLen);
        const bufferData   = this.buildDataBlock(totalLen, numberOfBuffers);

        const outgoing = Buffer.concat([
            bufferHeader,
            bufferData,
            payload.cb.acbx,
            ...abdData.map(e => e.abd.buffer),
            ...abdData.filter(e => e.buffer.length > 0).map(e => e.buffer),
        ]);

        if (this.shouldLog('before')) logger.debug(hexdump(outgoing, 'Before Payload Buffer'));
        if (this.shouldLog('cb'))     logger.debug(payload.cb.toString('before'));

        const result = expandBuffer(await this.client.send(outgoing), outgoing.length);

        if (this.shouldLog('after')) logger.debug(hexdump(result, 'After Payload Buffer'));

        this.parseResponse(result, payload, numberOfBuffers);

        if (this.shouldLog('cb')) logger.debug(payload.cb.toString('after'));

        return payload;
    }

    // -----------------------------------------------------------------------
    // Packet builders
    // -----------------------------------------------------------------------

    private buildHeader(payload: PayloadData, totalLen: number): Buffer {
        const header = Buffer.alloc(HEADER_LENGTH);
        const uuid   = payload.uuid ? Buffer.from(payload.uuid) : Buffer.alloc(UUID_LENGTH);

        header.write('ADATCP', HDR_EYECATCHER, 6, 'utf8');
        header.write('01',     HDR_VERSION,    2, 'utf8');
        header.writeUInt32BE(totalLen, HDR_TOTAL_LEN);
        header.writeUInt32BE(7,        HDR_TYPE);
        uuid.copy(header, HDR_UUID, 0, UUID_LENGTH);

        return header;
    }

    private buildDataBlock(totalLen: number, numberOfBuffers: number): Buffer {
        // DATA_LEN = everything after the outer 40-byte ADATCP header
        const blockLen = totalLen - HEADER_LENGTH;

        const block = Buffer.alloc(DATA_BLOCK_LENGTH);
        block.write('DATA0001', DATA_EYECATCHER, 8, 'utf8');
        block.writeUInt32LE(blockLen,        DATA_LEN);
        block.writeUInt32LE(1,               DATA_REQUEST);
        block.writeUInt32LE(numberOfBuffers, DATA_NR_BUFFERS);
        block.writeUInt32LE(0,               DATA_ZERO);

        return block;
    }

    // -----------------------------------------------------------------------
    // Response parser
    // -----------------------------------------------------------------------

    private parseResponse(result: Buffer, payload: PayloadData, numberOfBuffers: number): void {
        const acbxLen = payload.cb.acbx.length;
        const abdBase = ACBX_OFFSET + acbxLen;

        // Reconstruct ABD + data buffers from the response
        const resAbda   = new AdabasBufferStructure();
        let bufferStart = abdBase + numberOfBuffers * ABD_SIZE;

        for (let i = 0; i < numberOfBuffers; i++) {
            const abdSlice = result.subarray(abdBase + i * ABD_SIZE, abdBase + (i + 1) * ABD_SIZE);
            const abd      = new Abd();
            abd.buffer     = abdSlice;

            const dataSlice = result.subarray(bufferStart, bufferStart + abd.size);
            resAbda.newAbd(new AdabasBuffer(abd.id, dataSlice));
            bufferStart += abd.recv;
        }

        // Extract and pad the ACBX
        const acbxRaw = result.subarray(ACBX_OFFSET, ACBX_OFFSET + acbxLen);
        payload.cb.setBuffer(padBuffer(acbxRaw, ACBX_MAX_LENGTH));
        payload.abda = resAbda;
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private shouldLog(event: LogEvent): boolean {
        return this.log.includes(event);
    }
}