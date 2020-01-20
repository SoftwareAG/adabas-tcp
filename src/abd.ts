/*
 * Copyright © 2019-2020 Software AG, Darmstadt, Germany and/or its licensors
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

export class Abd {

    private encoding: string | undefined;

    private abd: Buffer;

    constructor() {
        this.abd = Buffer.alloc(48);
        this.abd.writeUInt16LE(48, 0);            // len
        this.abd.write('G2', 2, 2);               // ver
        this.abd.write('I', 6, 1);                // loc
    }

    get buffer(): Buffer {
        return this.abd;
    }
    set buffer(buffer: Buffer) {
        this.abd = buffer;
    }

    get id(): string {
        return this.abd.toString(this.encoding, 4, 5);
    }
    set id(value: string) {
        this.abd.write(value, 4, 1);
    }

    get size(): number {
        return new Int64LE(this.abd, 16).toNumber();
    }
    set size(value: number) {
        new Int64LE(value).toBuffer().copy(this.abd, 16, 0, 8);
    }

    get send(): number {
        return new Int64LE(this.abd, 24).toNumber();
    }
    set send(value: number) {
        new Int64LE(value).toBuffer().copy(this.abd, 24, 0, 8);
    }

    get recv(): number {
        return new Int64LE(this.abd, 32).toNumber();
    }
    set recv(value: number) {
        new Int64LE(value).toBuffer().copy(this.abd, 32, 0, 8);
    }
}