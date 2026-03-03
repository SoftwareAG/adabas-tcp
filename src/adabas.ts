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

import { ControlBlock } from './control-block';
import { CallType, CallData, PayloadData, AdabasOptions, CommandQueue, AdabasRecord, FdtResult } from './interfaces';
import { AdabasConnect } from './adabas-connect';
import { AdabasTcp } from './adabas-tcp';
import { AdabasBufferStructure } from './adabas-buffer-structure';
import { AdabasCall, LogEvent } from './adabas-call';
import { AdabasMap } from './adabas-map';
import { getFields, hexdump } from './common';
import logger from './logger';
import { AdabasMessage } from './adabas-message';
import { FileDescriptionTable } from './file-description-table';

// ---------------------------------------------------------------------------
// Constants — no more magic strings scattered through the code
// ---------------------------------------------------------------------------

const enum AdabasCommand {
    ReadISN      = 'L1',
    ReadSorted   = 'L3',
    Search       = 'S1',
    Store        = 'N1',
    StoreISN     = 'N2',
    Update       = 'A1',
    Delete       = 'E1',
    Hold         = 'HI',
    EndTrans     = 'ET',
    BackoutTrans = 'BT',
    Open         = 'OP',
    Close        = 'CL',
}

const DEFAULT_MULTIFETCH = 10;
const MULTIFETCH_ENTRY_SIZE = 16;
const MULTIFETCH_HEADER_SIZE = 4;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/**
 * Internal buffers produced by the Read path of `criteria()`.
 */
interface SearchBuffers {
    sb: Buffer;
    vb: Buffer;
}

/**
 * Extended CallData used internally by the cursor implementation.
 * `_cursorISN` carries the last-seen ISN between `next()` calls without
 * polluting the public `CallData` interface.
 */
interface CursorCallData extends CallData {
    _cursorISN?: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Cursor returned by readCursor() for explicit pagination control. */
export interface AdabasCursor {
    next(): Promise<AdabasRecord[]>;
    hasMore(): boolean;
    reset(): void;
}

/** Internal connection status */
const enum Status { Close, Open }

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

export class Adabas {
    private readonly host: string;
    private readonly port: number;

    private uuid: Buffer;
    private client: AdabasTcp;
    private adabas: AdabasCall;
    private multifetch: number;
    private connected = false;
    private cb: ControlBlock;
    private map: AdabasMap;
    private type: CallType = CallType.Undefined;
    private readonly message: AdabasMessage;
    private log: LogEvent[];

    // Queue management
    private readonly queue: CommandQueue[] = [];
    private executing = false;

    // Session state
    private status: Status = Status.Close;

    constructor(host: string, port: number, options?: AdabasOptions) {
        this.host = host;
        this.port = port;
        this.multifetch = DEFAULT_MULTIFETCH;

        if (options) this.applyOptions(options);

        this.cb      = new ControlBlock();
        this.client  = new AdabasTcp(host, port);
        this.adabas  = new AdabasCall(this.client, this.log);
        this.message = new AdabasMessage();
    }

    // ---------------------------------------------------------------------------
    // Configuration
    // ---------------------------------------------------------------------------

    private applyOptions(options: AdabasOptions): void {
        this.multifetch = options.multifetch ?? DEFAULT_MULTIFETCH;
        this.log        = options.log ?? null;
    }

    // ---------------------------------------------------------------------------
    // Connection
    // ---------------------------------------------------------------------------

    async connect(): Promise<Buffer> {
        this.uuid      = await new AdabasConnect(this.client).connect();
        this.connected = true;
        return this.uuid;
    }

    disconnect(): void {
        this.client.close();
        this.connected = false;
    }

    // ---------------------------------------------------------------------------
    // Public API — all routed through the async queue
    // ---------------------------------------------------------------------------

    public readFDT(callData: CallData = {}): Promise<FdtResult> {
        if (!callData.fnr) return Promise.reject(new Error('File number is not provided'));

        return new FileDescriptionTable(this.host, this.port, this.log)
            .getFDT(callData.fnr)
            .then((fdt: FdtResult) => {
                if (Array.isArray(fdt) && fdt.length === 0) {
                    throw new Error('File does not exist in the database');
                }
                return fdt;
            });
    }

    public create(callData: CallData = {}): Promise<number> {
        return this.enqueue(() => this.exeCreate(callData));
    }

    public read(callData: CallData = {}): Promise<AdabasRecord[]> {
        return this.enqueue(() => this.exeRead(callData));
    }

    public update(callData: CallData = {}): Promise<number> {
        return this.enqueue(() => this.exeUpdate(callData));
    }

    public delete(callData: CallData = {}): Promise<number> {
        return this.enqueue(() => this.exeDelete(callData));
    }

    public close(): Promise<boolean> {
        return this.enqueue(() => this.exeClose());
    }

    public endTransaction(): Promise<boolean> {
        return this.enqueue(() => this.exeEndTransaction());
    }

    public backoutTransaction(): Promise<boolean> {
        return this.enqueue(() => this.exeBackoutTransaction());
    }

    /**
     * Returns a cursor for explicit page-by-page iteration.
     * Avoids storing pagination state on the instance.
     */
    public readCursor(callData: CallData = {}): AdabasCursor {
        let lastISN  = 0;
        let pageDone = false;

        return {
            hasMore: () => !pageDone,
            reset:   () => { lastISN = 0; pageDone = false; },
            next:    (): Promise<AdabasRecord[]> => {
                if (pageDone) return Promise.resolve([]);

                const pageData: CursorCallData = { ...callData, _cursorISN: lastISN };

                return this.enqueue(() => this.exeRead(pageData)).then((result) => {
                    const records = result as AdabasRecord[];
                    if (records.length === 0 || records.length < (callData.page ?? Infinity)) {
                        pageDone = true;
                    }
                    if (records.length > 0) {
                        const last = records[records.length - 1];
                        lastISN = last._isn ?? lastISN;
                    }
                    return records;
                });
            },
        };
    }

    // ---------------------------------------------------------------------------
    // Queue engine
    // ---------------------------------------------------------------------------

    /**
     * Serialises all public operations through a single async queue.
     * Guarantees the `executing` flag is always cleared in `finally`.
     */
    private enqueue<T>(fn: () => Promise<T>): Promise<T> {
        if (!this.executing) {
            this.executing = true;
            return fn().finally(() => this.drainQueue());
        }
        return new Promise<T>((resolve, reject) => {
            const entry: CommandQueue = {
                _fn:     fn as () => Promise<unknown>,
                resolve: resolve as (value: unknown) => void,
                reject,
            };
            this.queue.push(entry);
        });
    }

    private drainQueue(): void {
        this.executing = false;
        if (this.queue.length === 0) return;

        const entry = this.queue.shift();
        this.executing = true;
        entry._fn().then(entry.resolve).catch(entry.reject).finally(() => this.drainQueue());
    }

    // ---------------------------------------------------------------------------
    // Operation implementations
    // ---------------------------------------------------------------------------

    private async exeCreate(callData: CallData): Promise<number> {
        this.validateCallData(callData, ['object']);
        this.type = CallType.Create;
        this.map  = await this.getMap(callData);
        return this.modify(callData.object as AdabasRecord, callData.isn as number | undefined);
    }

    private async exeRead(callData: CursorCallData): Promise< AdabasRecord[]> {
        this.type = CallType.Read;
        this.map  = await this.getMap(callData);
        await this.open(this.map.fnr);
        if (callData.isn !== undefined) {
            if (typeof callData.isn === 'number') {
                return [await this.get(callData.isn)];
            }
            if (typeof callData.isn === 'string') {
                return this.getAll(callData);
            }
            throw new Error(`Invalid type for ISN: ${typeof callData.isn}`);
        }
        return this.getAll(callData);
    }

    private async exeUpdate(callData: CallData): Promise<number> {
        if (!callData.criteria && !callData.isn) {
            throw new Error('No criteria or ISN provided.');
        }
        this.validateCallData(callData, ['object']);
        this.type = CallType.Update;
        this.map  = await this.getMap(callData);
        await this.open(this.map.fnr);

        const isn = callData.isn
            ? (callData.isn as number)
            : await this.criteriaToIsn(callData.criteria);

        await this.modify(callData.object as AdabasRecord, isn);
        return isn;
    }

    private async exeDelete(callData: CallData): Promise<number> {
        this.validateCallData(callData, ['criteria', 'isn']);
        this.type = CallType.Delete;
        this.map  = await this.getMap(callData);
        await this.open(this.map.fnr);
        if (callData.isn && typeof callData.isn === 'number') {
            this.cb.init({ fnr: this.map.fnr, cmd: AdabasCommand.Delete, isn: callData.isn });
            await this.callAdabas();
            if (this.cb.rsp !== 0) throw new Error(this.getMessage(this.cb)); 
            return callData.isn;
        }       
        return this.criteriaToIsn(callData.criteria);
    }

    private async exeClose(): Promise<boolean> {
        this.cb.init({ cmd: AdabasCommand.Close });
        await this.callAdabas();
        if (this.cb.rsp !== 0) throw new Error(this.getMessage(this.cb));
        this.status = Status.Close;
        return true;
    }

    private async exeEndTransaction(): Promise<boolean> {
        this.cb.init({ cmd: AdabasCommand.EndTrans });
        await this.callAdabas();
        if (this.cb.rsp !== 0) throw new Error(this.getMessage(this.cb));
        return true;
    }

    private async exeBackoutTransaction(): Promise<boolean> {
        this.cb.init({ cmd: AdabasCommand.BackoutTrans });
        await this.callAdabas(); // FIX: was missing await — response check was meaningless before
        if (this.cb.rsp !== 0) throw new Error(this.getMessage(this.cb));
        return true;
    }

    // ---------------------------------------------------------------------------
    // Open session
    // ---------------------------------------------------------------------------

    private async open(fnr: number, mode = 'UPD'): Promise<void> {
        if (this.status === Status.Open) return;

        const cb = new ControlBlock();
        cb.init({ cmd: AdabasCommand.Open });

        const abda = new AdabasBufferStructure();
        abda.add('F', Buffer.alloc(0));
        abda.add('R', Buffer.from(`${mode}=${fnr}.`));

        await this.callAdabas(abda, cb);

        if (this.cb.rsp !== 0) throw new Error(this.getMessage(this.cb));
        this.status = Status.Open;
    }

    // ---------------------------------------------------------------------------
    // Low-level Adabas call
    // ---------------------------------------------------------------------------

    private async callAdabas(
        abda: AdabasBufferStructure = null,
        cb: ControlBlock = this.cb,
    ): Promise<PayloadData> {
        if (!this.connected) await this.connect();
        const result = await this.adabas.call({ cb, abda, uuid: this.uuid });
        this.cb = result.cb;
        return result;
    }

    // ---------------------------------------------------------------------------
    // Read helpers
    // ---------------------------------------------------------------------------

    private async getAll(callData: CursorCallData): Promise<AdabasRecord[]> {
        const abda   = new AdabasBufferStructure();
        const result: AdabasRecord[] = [];
        let end      = false;
        let lastISN  = callData._cursorISN ?? 0;

        let range: string[] | undefined;
        if (callData.isn && typeof callData.isn === 'string') {
            range = callData.isn.split('-');
        }

        if (callData.criteria) {
            this.cb.init({ fnr: this.map.fnr, cid: 'ANGS' });

            const obj = this.criteriaToBuffers(callData.criteria);
            this.cb.cmd = AdabasCommand.Search;

            abda.add('F', Buffer.from(this.map.getFb()));
            abda.add('R', Buffer.alloc(this.map.getRbLen()));
            abda.add('S', obj.sb);
            abda.add('V', obj.vb);
            abda.add('I', Buffer.alloc(4));
        } else {
            this.cb.init({
                fnr:  this.map.fnr,
                cop1: 'M',
                cop2: 'I',
                cid:  'ANGA',
            });
            if (callData.sortedBy) {
                const item = this.map.list.find(i => i.longName === callData.sortedBy);
                if (!item) throw new Error(`'${callData.sortedBy}' not found in Datamap.`);
                this.cb.cmd  = AdabasCommand.ReadSorted;
                this.cb.add1 = item.shortName;
                this.cb.cop2 = 'A';
                this.cb.cid  = 'RELO';
            } else {
                this.cb.cmd = AdabasCommand.ReadISN;
                if (range) this.cb.isn = parseInt(range[0], 10);
            }

            const rbLen = this.map.getRbLen();
            abda.add('F', Buffer.from(this.map.getFb()));
            abda.add('R', Buffer.alloc(rbLen * this.multifetch));
            abda.add('M', Buffer.alloc(this.multifetch * MULTIFETCH_ENTRY_SIZE + MULTIFETCH_HEADER_SIZE));
        }

        if (lastISN > 0) this.cb.isn = lastISN + 1;

        do {
            const res = await this.callAdabas(abda);
            if (this.cb.rsp === 0) {
                const rb = res.abda.getBuffer('R');
                if (callData.criteria) {
                    result.push(this.createObject(this.cb.isn, rb));
                    this.cb.isn++;
                    if (this.cb.isq === 1) break;
                } else {
                    const mbRaw    = res.abda.getBuffer('M');
                    const mbPadded = this.padBuffer(mbRaw, this.multifetch * MULTIFETCH_ENTRY_SIZE + MULTIFETCH_HEADER_SIZE);
                    const multi    = getFields(mbPadded);
                    let offset     = 0;

                    for (let i = 0; i < multi.num; i++) {
                        const mbe = multi.mbe[i];
                        if (mbe.error === 0) {
                            const isn = mbe.isn;
                            if (range && isn > parseInt(range[1], 10)) { end = true; break; }

                            const r = Buffer.alloc(mbe.len);
                            rb.copy(r, 0, offset, offset + mbe.len);
                            result.push(this.createObject(isn, r));
                            offset += mbe.len;
                            lastISN = isn;

                            if (callData.page && result.length >= callData.page) {
                                end = true;
                                break;
                            }
                        }
                    }

                    if (multi.num < this.multifetch) end = true;
                    this.cb.isn = lastISN + 1;
                }
            }

            if (callData.criteria) {
                this.cb.cmd  = AdabasCommand.ReadISN;
                this.cb.cop2 = 'N';
            }
        } while (this.cb.rsp === 0 && !end);

        if (this.cb.rsp === 0 || this.cb.rsp === 3) return result;
        throw new Error(this.getMessage(this.cb));
    }

    private async get(isn: number): Promise<AdabasRecord > {
            this.cb.init({ fnr: this.map.fnr, cmd: AdabasCommand.ReadISN, isn, cop2: 'I' });
            const abda = new AdabasBufferStructure();
            abda.add('F', Buffer.from(this.map.getFb()));
            abda.add('R', Buffer.alloc(this.map.getRbLen()));
            const res = await this.callAdabas(abda);
            if (this.cb.rsp !== 0) {
                if (this.cb.rsp === 3) throw new Error('Record not found.');
                throw new Error(this.getMessage(this.cb));
            }
            return this.createObject(this.cb.isn, res.abda.getBuffer('R'));
    }

    // ---------------------------------------------------------------------------
    // Write helpers
    // ---------------------------------------------------------------------------

    private async modify(obj: AdabasRecord, isn?: number): Promise<number> {
        this.map.validate(obj);
        await this.open(this.map.fnr);

        // Build a map containing only the fields present in the request object
        const updateMap = new AdabasMap();
        for (const key of Object.keys(obj)) {
            const item = this.map.list.find(i => i.longName === key);
            if (item) {
                if (item.type === 'periodic') item.occ = (obj[key] as unknown[]).length;
                updateMap.add(item);
            }
        }

        const buf = updateMap.getRb(obj);

        if (this.type === CallType.Update) {
            // Hold record
            this.cb.init({ fnr: this.map.fnr, cmd: AdabasCommand.Hold, isn });
            await this.callAdabas();
            if (this.cb.rsp !== 0) {
                const msg = this.getMessage(this.cb);
                await this.exeClose();
                throw new Error(msg);
            }

            // Update record
            this.cb.init({ fnr: this.map.fnr, cmd: AdabasCommand.Update, isn, cop2: 'I' });
            const abda = new AdabasBufferStructure();
            abda.add('F', Buffer.from(updateMap.getFb(false)));
            abda.add('R', Buffer.from(buf as Buffer));
            await this.callAdabas(abda);
            if (this.cb.rsp !== 0) {
                const msg = this.getMessage(this.cb);
                await this.exeClose();
                throw new Error(msg);
            }
        }

        if (this.type === CallType.Create) {
            this.cb.init({ fnr: this.map.fnr, cop2: 'I' });
            if (isn && isn > 0) {
                this.cb.cmd = AdabasCommand.StoreISN;
                this.cb.isn = isn;
            } else {
                this.cb.cmd = AdabasCommand.Store;
            }
            const abda = new AdabasBufferStructure();
            abda.add('F', Buffer.from(updateMap.getFb(false)));
            abda.add('R', buf as Buffer);
            await this.callAdabas(abda);
            logger.debug({ rsp: this.cb.rsp }, 'Create response code');
            logger.debug(hexdump(Buffer.from(this.cb.add2), 'add2'));
            logger.debug(hexdump(buf as Buffer, 'rb'));
            if (this.cb.rsp !== 0) {
                const msg = this.getMessage(this.cb);
                await this.exeClose();
                throw new Error(msg);
            }
        }

        return this.cb.isn;
    }

    // ---------------------------------------------------------------------------
    // Search / criteria
    // ---------------------------------------------------------------------------

    /**
     * Parses a "field=value" criteria string into Adabas search buffers.
     * Used by the Read path.
     */
    private criteriaToBuffers(criteria: string): SearchBuffers {
        const [fieldName, fieldValue] = this.parseCriteria(criteria);
        const item = this.map.getField(fieldName);
        if (!item) throw new Error(`Field '${fieldName}' not found in Datamap.`);
        return {
            sb: Buffer.from(`${item.shortName},${fieldValue.length}.`),
            vb: Buffer.from(fieldValue),
        };
    }

    /**
     * Parses a "field=value" criteria string and resolves it to an ISN.
     * Used by the Update and Delete paths.
     * For Delete, also issues the E1 command to remove the record.
     */
    private async criteriaToIsn(criteria: string): Promise<number> {
        const [fieldName, fieldValue] = this.parseCriteria(criteria);
        const item = this.map.getField(fieldName);
        if (!item) throw new Error(`Field '${fieldName}' not found in Datamap.`);

        const sb = Buffer.from(`${item.shortName},${fieldValue.length}.`);
        const vb = Buffer.from(fieldValue);
        const isn = await this.getIsnFromCriteria(sb, vb);

        if (this.type === CallType.Delete && isn > 0) {
            this.cb.init({ fnr: this.map.fnr, cmd: AdabasCommand.Delete, isn });
            await this.callAdabas();
            if (this.cb.rsp !== 0) throw new Error(this.getMessage(this.cb));
        }

        return isn;
    }

    /**
     * Splits and validates a "field=value" criteria string.
     * Returns a [fieldName, fieldValue] tuple.
     */
    private parseCriteria(criteria: string): [string, string] {
        const parts = criteria.split('=');
        if (parts.length !== 2) throw new Error('Invalid search criteria.');
        return [parts[0], parts[1]];
    }

    private async getIsnFromCriteria(sb: Buffer, vb: Buffer): Promise<number> {
        this.cb.init({
            fnr:  this.map.fnr,
            cmd:  AdabasCommand.Search,
            cid:  'ADJS',
            cop2: 'I',
            isq:  2,
        });

        const abda = new AdabasBufferStructure();
        abda.add('F', Buffer.alloc(0));
        abda.add('R', Buffer.alloc(0));
        abda.add('S', sb);
        abda.add('V', vb);
        abda.add('I',   Buffer.alloc(8));

        await this.callAdabas(abda);

        if (this.cb.rsp !== 0) throw new Error(this.getMessage(this.cb));
        if (this.cb.isq === 0) throw new Error('No record with this criteria found.');
        if (this.cb.isq > 1)   throw new Error(`${this.cb.isq} records with this criteria found.`);

        return this.cb.isn;
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private createObject(isn: number, rb: Buffer): AdabasRecord {
        return this.map.getObject(rb, true, isn) as AdabasRecord;
    }

    private getMessage(cbx: ControlBlock): string {
        const info = this.message.getMessage(cbx);
        return `${info.message} ${info.explanation}`;
    }

    private async getMap(callData: CallData): Promise<AdabasMap> {
        const map = callData.map
            ?? await new FileDescriptionTable(this.host, this.port, this.log).getMap(callData.fnr);

        if (!map) throw new Error('Neither a map nor a file number was provided.');

        if (!callData.fields) return map;

        const filteredMap = new AdabasMap(map.fnr);
        for (const field of callData.fields) {
            const item = map.getField(field);
            if (item) filteredMap.add(item);
        }
        return filteredMap;
    }

    /**
     * Centralised input validation — throws with a clear message for each missing field.
     */
    private validateCallData(callData: CallData, required: (keyof CallData)[]): void {
        // If a single field is required, enforce it strictly.
        if (required.length === 1) {
            const field = required[0];
            if (callData[field] === undefined || callData[field] === null) {
                throw new Error(`'${field}' is required but was not provided.`);
            }
            return;
        }

        // If multiple fields are supplied, treat them as "at least one must be provided".
        for (const field of required) {
            if (callData[field] !== undefined && callData[field] !== null) {
                return;
            }
        }

        throw new Error(`One of [${required.join(', ')}] is required but none were provided.`);
    }

    /**
     * Pads a buffer to a target length with zeroes if it is shorter.
     */
    private padBuffer(buf: Buffer, targetLength: number): Buffer {
        const missing = targetLength - buf.length;
        return missing > 0 ? Buffer.concat([buf, Buffer.alloc(missing)]) : buf;
    }
}
