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

import { Abd } from './abd';

export class AdabasBuffer {
    private _abd: Abd;
    private _buffer: Buffer;

    constructor(type: string, buffer: Buffer) {
        const len = buffer.length;
        this._abd = new Abd();
        this._abd.id = type;
        this._abd.size = len;
        this._abd.send = len;
        this._abd.recv = len;
        this._buffer = buffer;
    }

    get abd(): Abd {
        return this._abd;
    }
    set abd(abd: Abd) {
        this._abd = abd;
    }

    get buffer(): Buffer {
        return this._buffer;
    }
    set buffer(buffer: Buffer) {
        this._buffer = buffer;
    }

    static newAbd(type: string, buffer: Buffer): AdabasBuffer {
        return new AdabasBuffer(type, buffer);
    }

    static newRb(buffer: Buffer): AdabasBuffer {
        return this.newAbd('R', buffer);
    }

    static newFb(buffer: Buffer): AdabasBuffer {
        return this.newAbd('F', buffer);
    }

    static newIb(buffer: Buffer): AdabasBuffer {
        return this.newAbd('I', buffer);
    }

    static newVb(buffer: Buffer): AdabasBuffer {
        return this.newAbd('V', buffer);
    }

    static newSb(buffer: Buffer): AdabasBuffer {
        return this.newAbd('S', buffer);
    }

    static newMb(buffer: Buffer): AdabasBuffer {
        return this.newAbd('M', buffer);
    }
}