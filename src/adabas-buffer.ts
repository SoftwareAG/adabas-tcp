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

import { Abd } from './abd';
import { BufferId } from './adabas-buffer-structure';

export class AdabasBuffer {
    private _abd: Abd;
    private _buffer: Buffer;

    constructor(type: BufferId, buffer: Buffer) {
        this._abd = new Abd();
        this._abd.id = type;
        this._abd.size = buffer.length;
        this._abd.send = buffer.length;
        this._abd.recv = buffer.length;
        this._buffer = buffer;
    }

    get abd(): Abd {
        return this._abd;
    }
    // set abd(abd: Abd) {
    //     this._abd = abd;
    // }

    get buffer(): Buffer {
        return this._buffer;
    }
    set buffer(buffer: Buffer) {
        this._buffer = buffer;
        this._abd.size = buffer.length;
        this._abd.send = buffer.length;
        this._abd.recv = buffer.length;
    }
}