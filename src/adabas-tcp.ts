/*
 * Copyright © 2019-2022 Software AG, Darmstadt, Germany and/or its licensors
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


const HOST = 'localhost';
const PORT = 49152;

export class AdabasTcp {
    private socket: Socket;
    private queue: QueueElement[] = [];
    private length = 0;
    private totalLength = -1;
    private buffer: Buffer;
 
    constructor(host: string, port: number) {
        this.socket = new Socket();
        host = host || HOST;
        port = port || PORT;
        this.socket.connect(port, host, () => {
            // console.log(`Client connected to: ${host} : ${port}`);
        });
        this.socket.on('close', () => {
            // console.log('Client closed');
        });

        this.socket.on('data', (data) => {
            if (this.length < this.totalLength) {
                this.length += data.length;
                this.buffer = Buffer.concat([this.buffer, data]);
                if (this.length >= this.totalLength) {
                    this.resolveData(this.buffer);
                    this.totalLength = -1;
                }
            }
            else {
                if (data.length < data.readUInt32BE(8)) { // current buffer length is smaller than total buffer length from ADATCP header
                    this.length = data.length;
                    this.totalLength = data.readUInt32BE(8);
                    this.buffer = Buffer.from(data);
                }
                else {
                    this.resolveData(data);
                }
            }
        });

        this.socket.on('error', (err) => {
            if (this.queue.length > 0) {
                this.queue[0].reject(err);
            }
            else {
                console.log(err);
            }
        });

        process.on('warning', e => console.warn(e.stack));
    }

    resolveData(data: Buffer): void {
        const element = this.queue.shift();
        element.resolve(data);
        if (this.queue.length > 0) { // more call in queue
            this.socket.write(this.queue[0].data);
        }
    }

    send(data: Buffer): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            this.queue.push({ data, resolve, reject });
            if (this.queue.length === 1) {
                this.socket.write(data);
            }
        });
    }

    close(): void {
        // console.log('destroy socket')
        this.socket.destroy();
    }
}
