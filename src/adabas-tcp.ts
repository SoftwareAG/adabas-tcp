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

import { Socket } from 'net';
// import { hexdump } from './common';
import { QueueElement } from './interfaces';


const HOST = 'localhost';
const PORT = 49152;

export class AdabasTcp {
    private socket: Socket;
    private queue: QueueElement[] = [];
 
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
            const element = this.queue.shift();
            // console.log(hexdump(data, 'After Payload Buffer'));
            element.resolve(data);
            if (this.queue.length > 0) { // more call in queue
                // console.log(hexdump(this.queue[0].data, 'Before Payload Buffer'));
                this.socket.write(this.queue[0].data);
            }
        });

        this.socket.on('error', (err) => {
            if (this.queue.length > 0) {
                // console.log(hexdump(this.queue[0].data, 'Error Payload Buffer'));
                this.queue[0].reject(err);
            }
            else {
                console.log(err);
            }
        });

        process.on('warning', e => console.warn(e.stack));
    }

    send(data: Buffer): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            this.queue.push({ data, resolve, reject });
            if (this.queue.length === 1) {
                // console.log(hexdump(data, 'Before Payload Buffer'));
                this.socket.write(data);
            }
        });
    }

    close() {
        // console.log('destroy socket')
        this.socket.destroy();
    }
}
