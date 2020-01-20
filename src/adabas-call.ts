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

import { AdabasBufferStructure } from './adabas-buffer-structure';
import { PayloadData } from './interfaces';
import { AdabasTcp } from './adabas-tcp';
import { expandBuffer, hexdump } from './common';
import { AdabasBuffer } from './adabas-buffer';
import { Abd } from './abd';

export class AdabasCall {
    private client: AdabasTcp;
    private log: string[];

    constructor(client: AdabasTcp, log: string[] = []) {
        this.client = client;
        this.log = log;
    }

    call(payload: PayloadData): Promise<PayloadData> {
        return new Promise(async (resolve, reject) => {
            try {
                const bufferHeader = Buffer.alloc(40);
                const bufferData = Buffer.alloc(24);

                const bufferArray = [bufferHeader, bufferData, payload.cb.acbx];

                let numberOfBuffers = 0;

                if (payload.abda) {
                    const data = payload.abda.get();
                    numberOfBuffers = data.length;
                    // add ABD
                    data.forEach(element => {
                        bufferArray.push(element.abd.buffer);
                    });
                    // add buffer
                    data.forEach(element => {
                        if (element.buffer.length) {
                            bufferArray.push(element.buffer);
                        }
                    });
                }

                let len = 0;
                bufferArray.forEach(b => len += b.length);
                // fill data to buffers
                const id: Buffer = payload.uuid ? Buffer.from(payload.uuid) : Buffer.alloc(16);

                bufferHeader.write('ADATCP', 0, 6);           // eyecatcher
                bufferHeader.write('01', 6, 2);               // one
                bufferHeader.writeUInt32BE(len, 8);           // len
                bufferHeader.writeUInt32BE(7, 12);            // type
                id.copy(bufferHeader, 16, 0, 16);

                bufferData.write('DATA0001', 0, 8);                       // eyecatcher
                bufferData.writeUInt32LE(len - bufferHeader.length, 8); // len     
                bufferData.writeUInt32LE(1, 12);                        // request 
                bufferData.writeUInt32LE(numberOfBuffers, 16);          // nrBuffers
                bufferData.writeUInt32LE(0, 20);                        // zero 

                const buffer = Buffer.concat(bufferArray);

                if (this.log) {
                    if (this.log.includes('before')) console.log(hexdump(buffer, 'Before Payload Buffer'));
                    if (this.log.includes('cb')) console.log(payload.cb.toString('before'));
                }
                const result = expandBuffer(await this.client.send(buffer), len);
                if (this.log) {
                    if (this.log.includes('after')) console.log(hexdump(result, 'After Payload Buffer'));
                }
                const resAbda = new AdabasBufferStructure();

                let bufferStart = 64 + payload.cb.acbx.length + numberOfBuffers * 48;
                for (let i = 0; i < numberOfBuffers; i++) {
                    const buf = result.slice(64 + payload.cb.acbx.length + i * 48, 64 + payload.cb.acbx.length + (i + 1) * 48);
                    const abd = new Abd();
                    abd.buffer = buf;
                    const adabasBuffer = new AdabasBuffer(abd.id, result.slice(bufferStart, bufferStart + abd.size));
                    resAbda.newAbd(adabasBuffer);
                    bufferStart += abd.recv;
                }
                let b = result.slice(64, 64 + payload.cb.acbx.length);
                const missing = 192 - b.length;
                if (missing > 0) b = Buffer.concat([b, Buffer.alloc(missing)]);

                payload.cb.setBuffer(b);
                payload.abda = resAbda;
                if (this.log) {
                    if (this.log.includes('cb')) console.log(payload.cb.toString('after'));
                }
                resolve(payload);
            } catch (error) {
                reject(error);
            }
        });
    }

}
