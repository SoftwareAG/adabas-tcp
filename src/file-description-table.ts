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

import { AdabasMap } from './adabas-map';
import { AdabasConnect } from './adabas-connect';
import { AdabasTcp } from './adabas-tcp';
import { AdabasBufferStructure } from './adabas-buffer-structure';
import { AdabasCall } from './adabas-call';
import { ControlBlock } from './control-block';

export class FileDescriptionTable {

    private encoding: BufferEncoding;

    private client: AdabasTcp;

    constructor(host: string, port: number) {
        this.client = new AdabasTcp(host, port);
    }

    getFDT(fnr: number): Promise<object> {
        return new Promise(async (resolve, reject) => {
            try {
                const uuid = await new AdabasConnect(this.client).connect();
                const len = 0x10000;
                const cb = new ControlBlock();
                cb.init({
                    fnr,
                    typ: 0x30,
                    rbl: len,
                    cmd: 'LF',
                    cop2: 'S'
                });
                const abda = new AdabasBufferStructure();
                abda.newRb(Buffer.alloc(len));
                const result = await new AdabasCall(this.client).call({ cb, abda, uuid });
                const rb = result.abda.getBuffer('R');
                const numberOfFields = rb.readUInt16LE(2);
                const fdt = [];
                for (let index = 0; index < numberOfFields; index++) {
                    const offset = 4 + index * 8; 
                    const indicator = rb.toString(this.encoding, offset, offset + 1);
                    const name = rb.toString(this.encoding, offset + 1, offset + 3);
                    const option = rb.readUInt8(offset + 3);
                    const level = rb.readUInt8(offset + 4);                    
                    const length = rb.readUInt8(offset + 5);
                    const format = rb.toString(this.encoding, offset + 6, offset + 7);
                    const option2 = rb.readUInt8(offset + 7);
                    if (indicator === 'F') {
                        const field: any = {};
                        let pe = false;
                        let gr = false;
                        field.level = level;
                        field.name = name;
                        const o = [];
                        if (option & 8 && field.level == 1) {
                            pe = true;
                        }
                        if (!pe && length == 0 && format === ' ') {
                            gr = true;
                        }
                        // set options
                        if (option & 1) o.push('UQ');
                        if (option & 16) o.push('NU');
                        if (option & 32) o.push('MU');
                        if (option & 64) o.push('FI');
                        if (option & 128) o.push('DE');
                        if (option2 & 1) o.push('NC')
                        if (option2 & 2) o.push('NN');
                        if (option2 & 4) o.push('LB');
                        if (option2 & 8) o.push('LA');
                        if (option2 & 16) o.push('XI');
                        if (option2 & 32) o.push('HF');
                        if (option2 & 64) o.push('NV');
                        if (option2 & 128) o.push('NB');
                        if (pe) {
                            field.type = 'PE';
                        }
                        if (gr) {
                            field.type = 'GR';
                        }
                        if (o.length > 0) {
                            field.options = o;
                        }
                        if (!(pe || gr)) {
                            field.format = format;
                            field.length = length;
                        }
                        fdt.push(field);
                    }
                }
                // close adabas
                cb.init({
                    cmd: 'CL'
                });
                await new AdabasCall(this.client).call({ cb, abda: new AdabasBufferStructure(), uuid });
                this.client.close();
                resolve(fdt);
            } catch (error) {
                reject(error);
            }
        });
    }

    getMap(fnr: number): Promise<AdabasMap> {
        return new Promise(async (resolve, reject) => {
            try {
                const obj = await this.getFDT(fnr);
                const map = this.objectToMap(obj);
                map.fnr = fnr;
                resolve(map);
            } catch (error) {
                reject(error);
            }
        });
    }

    private objectToMap(object: any): AdabasMap {
        const FIELD_FORMAT_TABLE: any = {
            'A': 'alpha',
            'B': 'binary',
            'F': 'float',
            'G': 'fixed',
            'P': 'packed',
            'U': 'unpacked',
            'W': 'wide',
            'N': 'unpacked',
            'I': 'fixed'
        };
        const map = new AdabasMap();
        let m: any = map;
        for (let index = 0; index < object.length; index++) {
            const element = object[index];
            const longName = element.longName ? element.longName : element.name;
            if (element.format) {
                let mu = false;
                if (element.options) {
                    if (element.options.indexOf('MU') > 0) mu = true;
                }
                if (element.level === 1) {
                    m = map;
                }
                const type = FIELD_FORMAT_TABLE[element.format];
                if (mu) {
                    m[type](element.length, element.name, { name: longName, occ: 10 });
                }
                else {
                    m[type](element.length, element.name, { name: longName });
                }
            }
            else {
                switch (element.type) {
                    case 'GR':
                        // console.log('group');
                        m = new AdabasMap();
                        map.group(m, element.name, { name: longName });
                        break;
                    case 'PE':
                        // console.log('periodic');
                        m = new AdabasMap();
                        map.group(m, element.name, { name: longName, occ: 10 });
                        break;
                    default:
                        break;
                }
            }
        }
        return map;
    }
}