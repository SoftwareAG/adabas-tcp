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

import { ControlBlock } from './control-block';
import { CallType, CallData, PayloadData, AdabasOptions, CommandQueue } from './interfaces';
import { AdabasConnect } from './adabas-connect';
import { AdabasTcp } from './adabas-tcp';
import { AdabasBufferStructure } from './adabas-buffer-structure';
import { AdabasCall } from './adabas-call';
import { AdabasMap } from './adabas-map';
import { getFields } from './common';
import { AdabasMessage } from './adabas-message';
import { FileDescriptionTable } from './file-description-table';

enum Status { Close, Open };

export class Adabas {
    private host: string;
    private port: number;
    private uuid: Buffer;
    private client: AdabasTcp;
    private adabas: AdabasCall;
    private multifetch = 10;
    private connected: boolean;
    private cb: ControlBlock;
    private map: AdabasMap;
    private type: CallType = CallType.Undefined;
    private message: AdabasMessage;
    private fdt: object;
    private log: string[];
    private queue: CommandQueue[] = [];
    private executing = false;
    private status: Status = Status.Close;
    private lastISN = 0;
    private pageDone = false;

    constructor(host: string, port: number, options?: AdabasOptions) {
        if (options) this.setOptions(options);

        this.host = host;
        this.port = port;

        this.connected = false;

        this.cb = new ControlBlock();
        this.client = new AdabasTcp(host, port);

        this.adabas = new AdabasCall(this.client, this.log);

        this.message = new AdabasMessage();
    }

    private setOptions(options: AdabasOptions) {
        this.multifetch = options.multifetch || 10;
        this.log = options.log || null;
    }


    async connect(): Promise<Buffer> {
        this.uuid = await new AdabasConnect(this.client).connect();
        this.connected = true;
        return this.uuid;
    }

    public readFDT(callData: CallData = {}): Promise<any> {
        return new Promise(async (resolve, reject) => {
            if (!callData.fnr) reject('File number is not provided');

            try {
                this.fdt = await new FileDescriptionTable(this.host, this.port).getFDT(callData.fnr);
                if (JSON.stringify(this.fdt) == "[]") reject('File is not exist in the database');
                resolve(this.fdt);
            }
            catch (error) {
                reject(error);
            }
        });
    }

    public create(callData: CallData = {}): Promise<any> {
        return new Promise(async (resolve, reject) => {
            if (!this.executing) {
                this.exeCreate(callData, resolve, reject);
            }
            else {
                this.queue.push({ type: CallType.Create, data: callData, resolve, reject });
            }
        });
    }

    private async exeCreate(callData: CallData = {}, resolve: Function, reject: Function): Promise<any> {
        // validate input
        if (!callData.object) {
            reject('No object provided.');
        }
        else {
            this.executing = true;
            this.type = CallType.Create;
            // input data
            this.map = await this.getMap(callData);
            try {
                resolve(await this.modify(callData.object, callData.isn));
            } catch (error) {
                reject(error);
            }
        }
        this.nextCommand();
    }

    public read(callData: CallData = {}): Promise<any> {
        return new Promise(async (resolve, reject) => {
            if (!this.executing) {
                this.exeRead(callData, resolve, reject);
            }
            else {
                this.queue.push({ type: CallType.Read, data: callData, resolve, reject });
            }
        });
    }

    private async exeRead(callData: CallData = {}, resolve: Function, reject: Function): Promise<any> {
        this.executing = true;
        this.type = CallType.Read;
        // input data
        this.map = await this.getMap(callData);
        await this.open(this.map.fnr);
        try {
            if (callData.isn) {
                if (typeof (callData.isn) == 'number') {
                    resolve(await this.get(callData.isn));
                }
                else if (typeof (callData.isn) == 'string') {
                    resolve(await this.getAll(callData));
                }
                else {
                    reject('Invalid type for ISN: ' + typeof (callData.isn));
                }
            }
            else {
                resolve(await this.getAll(callData));
            }
        } catch (error) {
            reject(error);
        }
        this.nextCommand();
    }

    public update(callData: CallData = {}): Promise<number> {
        return new Promise(async (resolve, reject) => {
            if (!this.executing) {
                this.exeUpdate(callData, resolve, reject);
            }
            else {
                this.queue.push({ type: CallType.Update, data: callData, resolve, reject });
            }
        });
    }

    private async exeUpdate(callData: CallData = {}, resolve: Function, reject: Function) {
        let message = '';
        if (!callData.criteria && !callData.isn) message = 'no criteria or ISN provided.';
        if (!callData.object) message = 'no object provided.';
        if (message.length > 0) {
            reject(message);
        }
        else {
            this.executing = true;
            this.type = CallType.Update;
            // input data
            this.map = await this.getMap(callData);
            await this.open(this.map.fnr);
            try {
                const isn = callData.isn ? callData.isn : await this.criteria(callData.criteria);
                await this.modify(callData.object, isn);
                resolve(isn);
            } catch (error) {
                reject(error);
            }
        }
        this.nextCommand();
    }

    public delete(callData: CallData = {}): Promise<number> {
        return new Promise(async (resolve, reject) => {
            if (!this.executing) {
                this.exeDelete(callData, resolve, reject);
            }
            else {
                this.queue.push({ type: CallType.Delete, data: callData, resolve, reject });
            }
        });
    }

    private async exeDelete(callData: CallData = {}, resolve: Function, reject: Function) {
        if (!callData.criteria) {
            reject('no criteria defined.');
        }
        else {
            this.executing = true;
            this.type = CallType.Delete;
            // input data
            this.map = await this.getMap(callData);
            await this.open(this.map.fnr);
            try {
                resolve(await this.criteria(callData.criteria));
            } catch (error) {
                reject(error);
            }
        }
        this.nextCommand();
    }

    public close(): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            if (!this.executing) {
                this.exeClose(resolve, reject);
            }
            else {
                this.queue.push({ type: CallType.Close, data: {}, resolve, reject });
            }
        });
    }

    private async exeClose(resolve: Function, reject: Function) {
        this.executing = true;
        this.cb.init({
            cmd: 'CL'
        });
        await this.callAdabas();
        if (this.cb.rsp != 0) {
            reject(this.getMessage(this.cb));
        }
        else {
            resolve(true);
        }
        this.status = Status.Close;
        this.nextCommand();
    }

    public endTransaction(): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            if (!this.executing) {
                this.exeEndTransaction(resolve, reject);
            }
            else {
                this.queue.push({ type: CallType.ET, data: {}, resolve, reject });
            }
        });
    }

    private async exeEndTransaction(resolve: Function, reject: Function) {
        this.executing = true;
        this.cb.init({
            cmd: 'ET'
        });
        await this.callAdabas()
        if (this.cb.rsp != 0) {
            reject(this.getMessage(this.cb));
        }
        else {
            resolve(true);
        }
        this.nextCommand();
    }

    public backoutTransaction(): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            if (!this.executing) {
                this.exeBackoutTransaction(resolve, reject);
            }
            else {
                this.queue.push({ type: CallType.BT, data: {}, resolve, reject });
            }
        });
    }

    private async exeBackoutTransaction(resolve: Function, reject: Function) {
        this.executing = true;
        this.cb.init({
            cmd: 'BT'
        });
        this.callAdabas();
        if (this.cb.rsp != 0) {
            reject(this.getMessage(this.cb));
        }
        else {
            resolve(true);
        }
        this.nextCommand();
    }

    public disconnect(): void {
        this.client.close();
        this.connected = false;
    }

    private open(fnr: number, mode = 'UPD'): Promise<void> {
        return new Promise(async (resolve, reject) => {
            if (this.status === Status.Open) {
                resolve();
            }
            else {
                const cb = new ControlBlock();
                cb.init({
                    cmd: 'OP'
                });

                const abda = new AdabasBufferStructure();
                abda.newFb(Buffer.alloc(0));
                abda.newRb(Buffer.from(mode + '=' + fnr + '.'));
                await this.callAdabas(abda, cb);
                if (this.cb.rsp != 0) {
                    reject(this.getMessage(this.cb));
                }
                this.status = Status.Open;
                resolve();
            }
        });
    }

    private async nextCommand() {
        if (this.queue.length > 0) {
            const element = this.queue.shift();
            switch (element.type) {
                case CallType.Create:
                    this.exeCreate(element.data, element.resolve, element.reject);
                    break;
                case CallType.Read:
                    this.exeRead(element.data, element.resolve, element.reject);
                    break;
                case CallType.Update:
                    this.exeUpdate(element.data, element.resolve, element.reject);
                    break;
                case CallType.Delete:
                    this.exeDelete(element.data, element.resolve, element.reject);
                    break;
                case CallType.Close:
                    this.exeClose(element.resolve, element.reject);
                    break;
                case CallType.ET:
                    this.exeEndTransaction(element.resolve, element.reject);
                    break;
                case CallType.BT:
                    this.exeBackoutTransaction(element.resolve, element.reject);
                    break;
                default:
                    break;
            }
        }
        if (this.queue.length === 0) this.executing = false;
    }

    private async callAdabas(abda: AdabasBufferStructure = null, cb: ControlBlock = this.cb): Promise<PayloadData> {
        if (!this.connected) await this.connect();
        const result = await this.adabas.call({ cb, 'abda': abda, 'uuid': this.uuid });
        this.cb = result.cb;
        return result;
    }

    private async getAll(callData: CallData = {}) {
        if (this.pageDone) return [];
        if (callData.page && callData.page === 0) {
            this.lastISN = 0;
            return [];
        }
        let range: string[];
        if (callData.isn) {
            range = (callData.isn as string).split('-');
        }
        const abda = new AdabasBufferStructure();
        if (callData.criteria) {
            this.cb.init({
                fnr: this.map.fnr,
                cid: 'ANGS'
            });

            const obj = await this.criteria(callData.criteria);
            this.cb.cmd = 'S1';
            const ib = Buffer.alloc(4); // for one ISN
            // Note: for ADATCP the buffer order is important!
            abda.newFb(Buffer.from(this.map.getFb()));
            abda.newRb(Buffer.alloc(this.map.getRbLen()));
            abda.newSb(obj.sb);
            abda.newVb(obj.vb);
            abda.newIb(ib);
        }
        else {
            this.cb.init({
                fnr: this.map.fnr,
                cop1: 'M', // multifetch
                cop2: 'I',
                // isl: this.multifetch,
                cid: 'ANGA'
            });
            if (callData.sortedBy) {
                const item = this.map.list.find((item) => {
                    return item.longName === callData.sortedBy;
                });
                if (item === undefined) {
                    const message = '\'' + callData.sortedBy + '\' not found in Datamap.';
                    throw new Error(message);
                }
                this.cb.cmd = 'L3';
                this.cb.add1 = item.shortName;
                this.cb.cop2 = 'A';
                this.cb.cid = 'RELO';
            }
            else {
                this.cb.cmd = 'L1';
                if (callData.isn) {
                    this.cb.isn = parseInt(range[0]);
                }
            }
            abda.newFb(Buffer.from(this.map.getFb()));
            abda.newRb(Buffer.alloc(this.map.getRbLen() * this.multifetch));
            abda.newMb(Buffer.alloc(this.multifetch * 16 + 4));
        }

        if (this.lastISN > 0) {
            this.cb.isn = this.lastISN + 1;
        }
        const result: any[] = [];
        let end = false;
        do {
            // this.initCb(this.map.fnr);
            const res = await this.callAdabas(abda);
            if (this.cb.rsp === 0) {
                const rb = res.abda.getBuffer('R');
                if (callData.criteria) {
                    const object = this.createObject(this.cb.isn, rb);
                    result.push(object);
                    this.cb.isn++;
                    if (this.cb.isq === 1) {
                        break;
                    }
                }
                else {
                    let mb = res.abda.getBuffer('M');
                    const missing = this.multifetch * 16 + 4 - mb.length;
                    if (missing > 0) mb = Buffer.concat([mb, Buffer.alloc(missing)]);
                    const multi = getFields(mb);
                    let isn = 0;
                    let offset = 0;

                    for (let index = 0; index < multi.num; index++) {
                        if (multi.mbe[index].error === 0) {
                            isn = multi.mbe[index].isn;
                            if (callData.isn && (isn > parseInt(range[1]))) {
                                end = true;
                                break;
                            }
                            const r = Buffer.alloc(multi.mbe[index].len);
                            rb.copy(r, 0, offset, offset + multi.mbe[index].len);
                            const object = this.createObject(isn, r);
                            offset += multi.mbe[index].len;
                            result.push(object);
                            if (callData.page && result.length >= callData.page) {
                                end = true;
                                this.lastISN = isn;
                                break;
                            }
                        }
                        else {
                            if (callData.page) {
                                this.pageDone = true;
                                this.lastISN = 0; // no more data
                            }
                        }
                    }
                    if (multi.num < this.multifetch) end = true;
                    this.cb.isn = isn + 1;
                }
            }
            if (callData.criteria) {
                this.cb.cmd = 'L1';
                this.cb.cop2 = 'N'; // get next
            }
        }
        while (this.cb.rsp === 0 && !end);
        if (this.cb.rsp === 0 || this.cb.rsp === 3) {
            return result;
        } else {
            throw new Error(this.getMessage(this.cb));
        }
    }

    private async get(isn: number) {
        if (this.type === CallType.Read) {
            this.cb.init({
                fnr: this.map.fnr,
                cmd: 'L1',
                isn,
                cop2: 'I'
            });
            const fb = Buffer.from(this.map.getFb());
            const rb = Buffer.alloc(this.map.getRbLen());
            const abda = new AdabasBufferStructure();
            abda.newFb(fb);
            abda.newRb(rb);
            const res = await this.callAdabas(abda);
            if (this.cb.rsp === 0) {
                const rb = res.abda.getBuffer('R');
                const obj = this.createObject(this.cb.isn, rb);
                return obj;
            }
            else {
                throw new Error(this.getMessage(this.cb));
            }
        }
        if (this.type === CallType.Delete) {
            this.cb.init({
                fnr: this.map.fnr,
                cmd: 'E1',
                isn
            });
            await this.callAdabas();
            if (this.cb.rsp != 0) {
                throw new Error(this.getMessage(this.cb));
            }
            return isn;
        }
        throw new Error('Call type not supported');
    }

    private async modify(obj: any, isn?: number) {
        this.map.validate(obj);
        this.open(this.map.fnr);
        // create new map containing only fields from the request
        const updateMap = new AdabasMap();
        Object.keys(obj).forEach((key) => {
            const item = this.map.list.find((item) => {
                return item.longName === key;
            });
            if (item) {
                if (item.type === 'periodic') {
                    item.occ = obj[key].length;
                }
                updateMap.add(item);
            }
        });
        const buf = updateMap.getRb(obj);
        if (this.type === CallType.Update) {
            // set record in hold
            this.cb.init({
                fnr: this.map.fnr,
                cmd: 'HI',
                isn
            });
            await this.callAdabas();
            if (this.cb.rsp != 0) {
                const message = this.getMessage(this.cb);
                this.close();
                throw new Error(message);
            }
            // update record
            this.cb.init({
                fnr: this.map.fnr,
                cmd: 'A1',
                isn,
                cop2: 'I'
            });
            const abda = new AdabasBufferStructure();
            abda.newFb(Buffer.from(updateMap.getFb(false)));
            abda.newRb(Buffer.from(buf as Buffer));
            await this.callAdabas(abda);
            if (this.cb.rsp != 0) {
                const message = this.getMessage(this.cb);
                this.close();
                throw new Error(message);
            }
        }
        if (this.type === CallType.Create) {
            // insert record
            this.cb.init({
                fnr: this.map.fnr,
                cop2: 'I'
            });
            const fb = Buffer.from(updateMap.getFb(false));
            if (isn && isn > 0) {
                this.cb.cmd = 'N2';
                this.cb.isn = isn;
            } else {
                this.cb.cmd = 'N1';
            }
            const abda = new AdabasBufferStructure();
            abda.newFb(fb);
            abda.newRb(buf as Buffer);

            await this.callAdabas(abda);
            // console.log('----------------------->', this.cb.rsp);
            // console.log(hexdump(Buffer.from(this.cb.add2), 'add2'));
            // console.log(hexdump(buf as Buffer, 'rb'));
            if (this.cb.rsp != 0) {
                const message = this.getMessage(this.cb);
                this.close();
                throw new Error(message);
            }
        }
        return (this.cb.isn);
    }

    private createObject(isn: number, rb: Buffer): object {
        return this.map.getObject(rb, true, isn);
    }

    private async criteria(criteria: string): Promise<any> {
        const search = criteria.split('=');
        // this.search = true;
        if (search.length != 2) {
            const message = 'Invalid search criteria.';
            throw new Error(message);
        }
        try {
            const item = this.map.getField(search[0]);
            // const item = this.map.list.find((item) => {
            //     return item.longName === search[0];
            // });
            if (item === undefined) {
                const message = 'Longname ' + search[0] + ' not found in Datamap.';
                throw new Error(message);
            }
            const sb = Buffer.from(item.shortName + ',' + search[1].length + '.');
            const vb = Buffer.from(search[1]);
            let isn;
            switch (this.type) {
                case CallType.Update: // update
                    isn = await this.getIsnFromCriteria(sb, vb);
                    // if (isn > 0) {
                    //     this.isn(isn);
                    // }
                    return isn;
                case CallType.Read: // read
                    // sb = Buffer.from(item.shortName + ',' + search[1].length + ',S,' + item.shortName + ',' + search[1].length + '.');
                    return { sb, vb }
                case CallType.Delete: // delete
                    isn = await this.getIsnFromCriteria(sb, vb);
                    if (isn > 0) {
                        this.cb.init({
                            fnr: this.map.fnr,
                            cmd: 'E1',
                            isn
                        });
                        await this.callAdabas();
                        if (this.cb.rsp != 0) {
                            throw new Error(this.getMessage(this.cb));
                        }
                        return isn;
                    }
                    break;
                default:
                    throw new Error('Unknow type: ' + this.type);
            }
        } catch (error) {
            throw new Error(error);
        }
    }

    private async getIsnFromCriteria(sb: Buffer, vb: Buffer): Promise<number> {
        // const isn = [];
        this.cb.init({
            fnr: this.map.fnr,
            cmd: 'S1',
            cid: 'ADJS',
            cop2: 'I',
            isq: 2
        });
        // buffers 
        // Note: for ADATCP the buffer order is important!
        const abda = new AdabasBufferStructure();
        abda.newFb(Buffer.alloc(0));
        abda.newRb(Buffer.alloc(0));
        abda.newSb(sb);
        abda.newVb(vb);
        abda.newIb(Buffer.alloc(8));

        await this.callAdabas(abda);
        if (this.cb.rsp === 0) {
            if (this.cb.isq === 0) {
                const message = 'No record with this criteria found.';
                throw new Error(message);
            } else {
                if (this.cb.isq > 1) {
                    const message = this.cb.isq + ' records with this criteria found.';
                    throw new Error(message);
                }
            }
        }
        else {
            throw new Error(this.getMessage(this.cb));
        }
        return this.cb.isn;
    }


    private getMessage(cbx: any) {
        return this.message.getMessage(cbx).message + ' ' + this.message.getMessage(cbx).explanation;
    }

    private async getMap(callData: CallData): Promise<AdabasMap> {
        const map = callData.map || await new FileDescriptionTable(this.host, this.port).getMap(callData.fnr);
        if (!map) throw new Error('Neither map or file number provided');
        if (callData.fields) {
            const filteredMap = new AdabasMap(map.fnr);
            callData.fields.forEach((field) => {
                const item = map.getField(field);
                if (item) {
                    filteredMap.add(item);
                }
            });
            return filteredMap;
        }
        else
            return map;
    }
}
