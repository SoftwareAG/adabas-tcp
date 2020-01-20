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

import { AdabasBuffer } from './adabas-buffer';

export class AdabasBufferStructure {
    private data: AdabasBuffer[];

    constructor() {
        this.data = [];
    }

    newRb(buffer: Buffer): void {
        this.newAbd(AdabasBuffer.newRb(buffer));
    }

    newFb(buffer: Buffer): void {
        this.newAbd(AdabasBuffer.newFb(buffer));
    }

    newIb(buffer: Buffer): void {
        this.newAbd(AdabasBuffer.newIb(buffer));
    }

    newVb(buffer: Buffer): void {
        this.newAbd(AdabasBuffer.newVb(buffer));
    }

    newSb(buffer: Buffer): void {
        this.newAbd(AdabasBuffer.newSb(buffer));
    }

    newMb(buffer: Buffer): void {
        this.newAbd(AdabasBuffer.newMb(buffer));
    }

    newAbd(abd: AdabasBuffer): void {
        this.data.push(abd);
    }

    get(): AdabasBuffer[] {
        return this.data;
    }

    getBuffer(type: string): Buffer | null {
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i].abd.id == type) {
                return this.data[i].buffer;
            }
        }
        return null;
    }

    dump() {
        this.data.forEach( (e) => {
            console.log(e.abd.id, e.buffer.length);
        })
    }
}
