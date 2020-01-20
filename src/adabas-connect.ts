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



import { AdabasTcp } from './adabas-tcp';

export class AdabasConnect {

    private adabas: AdabasTcp;

    constructor(client: AdabasTcp) {
        this.adabas = client;
    }

    connect(): Promise<Buffer> {
        return new Promise(async (resolve, reject) => {
            try {
                const len = 112;
                const buffer = Buffer.alloc(len);
                buffer.write('ADATCP', 0, 6);           // eyecatcher
                buffer.write('01', 6, 2);               // one
                buffer.writeUInt32BE(len, 8);           // len
                buffer.writeUInt32BE(1, 12);            // type
                buffer.writeInt8(2, 104);                // endian
                buffer.writeInt8(1, 105);                // charset
                buffer.writeInt8(1, 106);                // float
                const data = await this.adabas.send(buffer);
                const uuid = data.slice(16, 32);
                resolve(uuid);
            } catch (error) {
                reject(error);
            }
        });
    }
}