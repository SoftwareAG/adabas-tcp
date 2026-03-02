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

import { Int64LE } from 'int64-buffer';
import { BufferId } from './adabas-buffer-structure';

export class Abd {

    // Adabas Buffer Descriptor (ABD) — 48-byte wire structure
    private static readonly OFFSET_LEN = 0; // UInt16LE — structure length (always 48)
    private static readonly OFFSET_VER = 2; // 2 bytes  — version ('G2')
    private static readonly OFFSET_ID = 4; // 1 byte   — buffer type ('R','F','S','V','I','M')
    private static readonly OFFSET_LOC = 6; // 1 byte   — location ('I' = indirect)
    private static readonly OFFSET_SIZE = 16; // Int64LE  — allocated buffer size
    private static readonly OFFSET_SEND = 24; // Int64LE  — bytes to send
    private static readonly OFFSET_RECV = 32; // Int64LE  — bytes received

    private readonly encoding: BufferEncoding = 'utf8';

    private abd: Buffer;

    constructor() {
        this.abd = Buffer.alloc(48);
        this.abd.writeUInt16LE(48, Abd.OFFSET_LEN);           
        this.abd.write('G2', Abd.OFFSET_VER, 2, this.encoding);          
        this.abd.write('I', Abd.OFFSET_LOC, 1, this.encoding);    
    }

    get buffer(): Buffer {
        return this.abd;
    }
    set buffer(buffer: Buffer) {
        if (buffer.length < 48) {
            throw new Error(`ABD buffer must be at least 48 bytes, got ${buffer.length}.`);
        }
        this.abd = buffer;
    }

    get id(): BufferId {
        return this.abd.toString(this.encoding, Abd.OFFSET_ID, Abd.OFFSET_ID + 1) as BufferId;
    }
    set id(value: BufferId) {
        this.abd.write(value, Abd.OFFSET_ID, 1);
    }

    get size(): number { return this.readInt64(Abd.OFFSET_SIZE); }
    set size(value: number) { this.writeInt64(value, Abd.OFFSET_SIZE); }


    get send(): number { return this.readInt64(Abd.OFFSET_SEND); }
    set send(value: number) { this.writeInt64(value, Abd.OFFSET_SEND); }

    get recv(): number { return this.readInt64(Abd.OFFSET_RECV); }
    set recv(value: number) { this.writeInt64(value, Abd.OFFSET_RECV); }

    private writeInt64(value: number, offset: number): void {
        new Int64LE(value).toBuffer().copy(this.abd, offset, 0, 8);
    }

    private readInt64(offset: number): number {
        return new Int64LE(this.abd, offset).toNumber();
    }

}