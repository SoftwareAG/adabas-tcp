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

import Joi = require('joi');
import { Int64LE } from 'int64-buffer';
import { AdabasRecord, MapData, MapOption } from './interfaces';
import logger from './logger';
import { getNumberFromDate } from './common';

// ---------------------------------------------------------------------------
// Field-value types
// ---------------------------------------------------------------------------

/**
 * A single scalar value read from or written to an Adabas field.
 */
type ScalarFieldValue = string | number | Buffer | Date;

// ---------------------------------------------------------------------------
// Field-format constants
// ---------------------------------------------------------------------------

const TYPE_REGULAR = 'regular';
const TYPE_MULTIPLE = 'multiple';
const TYPE_PERIODIC = 'periodic';
const TYPE_GROUP = 'group';

const FIELD_FORMAT_ALPHA = 'alpha';
const FIELD_FORMAT_BINARY = 'binary';
const FIELD_FORMAT_FIXED = 'fixed';
const FIELD_FORMAT_FLOAT = 'float';
const FIELD_FORMAT_PACKED = 'packed';
const FIELD_FORMAT_UNPACKED = 'unpacked';
const FIELD_FORMAT_WIDE = 'wide';

// ---------------------------------------------------------------------------
// AdabasMap
// ---------------------------------------------------------------------------

export class AdabasMap {

    private _fnr: number;
    private _list: MapData[];
    private schema: Joi.ObjectSchema;

    constructor(fnr = 0) {
        this._fnr = fnr;
        this._list = [];
        this.schema = Joi.object();
    }

    get fnr(): number { return this._fnr; }
    set fnr(fnr: number) { this._fnr = fnr; }
    get list(): MapData[] { return this._list; }

    add(obj: MapData): AdabasMap {
        this._list.push(obj);
        return this;
    }

    getField(name: string): MapData | null {
        for (const f of this._list) {
            if (f.longName === name) return f;
            if (f.type === TYPE_GROUP && f.map) {
                const nested = f.map.getField(name);
                if (nested !== null) return nested;
            }
        }
        return null;
    }

    // -----------------------------------------------------------------------
    // Field builders
    // -----------------------------------------------------------------------

    field(shortName: string, length: number, format: string, validate: Joi.Schema, options?: MapOption): AdabasMap {
        const opt = options ?? { occ: 0, name: shortName };
        const occ = opt.occ ?? 0;
        const longName = opt.name ?? shortName;

        if (shortName.length !== 2) throw new Error('Only two bytes allowed for Short Name.');
        if (occ < 0) throw new Error('Occurrence must not be negative.');

        const object: MapData = { type: TYPE_REGULAR, shortName, longName, format, length, options };

        if (occ === 0) {
            this._list.push(object);
            this.appendSchema(longName, validate);
        } else {
            object.type = TYPE_MULTIPLE;
            object.occ = occ;
            this._list.push(object);
            this.appendSchema(longName, Joi.array().max(occ));
        }
        return this;
    }

    alpha(length: number, shortName: string, options?: MapOption): AdabasMap {
        return this.field(shortName, length, 'A', Joi.string(), options);
    }

    wide(length: number, shortName: string, options?: MapOption): AdabasMap {
        return this.field(shortName, length, 'W', Joi.string(), options);
    }

    binary(length: number, shortName: string, options?: MapOption): AdabasMap {
        if (options?.format === 'number' && ![1, 2, 4, 8].includes(length)) {
            throw new Error('Number format only allowed for binary of length 1, 2, 4 or 8.');
        }
        const joi = options?.format === 'number' ? Joi.number() : Joi.binary();
        return this.field(shortName, length, 'B', joi, options);
    }

    fixed(length: number, shortName: string, options?: MapOption): AdabasMap {
        if (![1, 2, 4, 8].includes(length)) throw new Error('Fields of type fixed must have a length of 1, 2, 4 or 8.');
        return this.field(shortName, length, 'F', Joi.number(), options);
    }

    float(length: number, shortName: string, options?: MapOption): AdabasMap {
        if (![4, 8].includes(length)) throw new Error('Fields of type float must have a length of 4 or 8.');
        return this.field(shortName, length, 'G', Joi.number(), options);
    }

    packed(length: number, shortName: string, options?: MapOption): AdabasMap {
        const joi = (options?.format === 'date' || options?.format === 'time') ? Joi.date() : Joi.number();
        return this.field(shortName, length, 'P', joi, options);
    }

    unpacked(length: number, shortName: string, options?: MapOption): AdabasMap {
        const joi = (options?.format === 'date' || options?.format === 'time') ? Joi.date() : Joi.number();
        return this.field(shortName, length, 'U', joi, options);
    }

    group(map: AdabasMap, shortName: string, options?: MapOption): AdabasMap {
        const occ = options?.occ ?? 0;
        const longName = options?.name ?? shortName;

        if (occ < 0) throw new Error('Occurrence must not be negative.');

        if (occ === 0) {
            this._list.push({ type: TYPE_GROUP, shortName, longName, format: 'GR', map, options });
            this.appendSchema(longName, Joi.object());
        } else {
            this._list.push({ type: TYPE_PERIODIC, shortName, longName, format: 'PE', occ, map, options });
            this.appendSchema(longName, Joi.array().max(occ));
        }
        return this;
    }

    // -----------------------------------------------------------------------
    // Format-buffer helpers
    // -----------------------------------------------------------------------

    getFb(counter = true, occ = 0, group = false): string {
        const occString = occ > 0 ? `1-${occ}` : '';
        const parts: string[] = [];

        for (const item of this._list) {
            switch (item.type) {
                case TYPE_REGULAR:
                    parts.push(`${item.shortName}${occString},${item.length},${item.format}`);
                    break;

                case TYPE_MULTIPLE: {
                    const tokens: string[] = [];
                    if (counter) tokens.push(`${item.shortName}${occString}C,1,B`);
                    const range = occ > 0
                        ? `${item.shortName}${occString}(1-${item.occ}),${item.length},${item.format}`
                        : `${item.shortName}${occString}1-${item.occ},${item.length},${item.format}`;
                    tokens.push(range);
                    parts.push(tokens.join(','));
                    break;
                }

                case TYPE_PERIODIC:
                    if (counter) parts.push(`${item.shortName}${occString}C,1,B`);
                    parts.push(item.map.getFb(counter, item.occ, true));
                    break;

                case TYPE_GROUP:
                    parts.push(item.map.getFb(counter, 0, true));
                    break;
            }
        }

        return group ? parts.join(',') : parts.join(',') + '.';
    }

    getRbLen(counter = 1): number {
        let len = 0;
        logger.debug({ listLength: this._list.length }, 'map list length');

        for (const item of this._list) {
            switch (item.type) {
                case TYPE_REGULAR:
                    len += item.length;
                    break;
                case TYPE_MULTIPLE:
                    len += item.length * item.occ + counter;
                    break;
                case TYPE_PERIODIC:
                    len += item.map.getRbLen(counter) * item.occ + counter;
                    logger.debug({ len }, 'getRbLen incremental');
                    break;
                case TYPE_GROUP:
                    len += item.map.getRbLen(counter);
                    break;
            }
        }
        return len;
    }

    getRb(object: AdabasRecord, counter = false): Buffer {
        this.setOffset(counter);
        const cnt = counter ? 1 : 0;
        const buffer = this.initBuffer(this.getRbLen(cnt));

        for (const key of Object.keys(object)) {
            const item = this._list.find(i => i.longName === key);
            if (!item) continue;

            switch (item.type) {
                case TYPE_REGULAR:
                    this.setBuffer(buffer, object[key] as ScalarFieldValue, item, item.offset);
                    break;

                case TYPE_MULTIPLE:
                    (object[key] as ScalarFieldValue[]).forEach((value, index) => {
                        this.setBuffer(buffer, value, item, item.offset + index * item.length);
                    });
                    break;

                case TYPE_GROUP: {
                    const grBuffer = item.map.getRb(object[key] as AdabasRecord);
                    grBuffer.copy(buffer, item.offset, 0, grBuffer.length);
                    break;
                }

                case TYPE_PERIODIC:
                    (object[key] as AdabasRecord[]).forEach((peRecord, index) => {
                        for (const peKey of Object.keys(peRecord)) {
                            const peItem = item.map._list.find(i => i.longName === peKey);
                            if (!peItem) continue;

                            if (peItem.occ) {
                                // multiple-value field within periodic group
                                (peRecord[peKey] as ScalarFieldValue[]).forEach((val, i) => {
                                    this.setBuffer(buffer, val, peItem,
                                        item.offset + peItem.offset + (index * peItem.occ + i) * peItem.length);
                                });
                            } else {
                                this.setBuffer(buffer, peRecord[peKey] as ScalarFieldValue, peItem,
                                    item.offset + peItem.offset + index * peItem.length);
                            }
                        }
                    });
                    break;
            }
        }
        return buffer;
    }

    // -----------------------------------------------------------------------
    // Object extraction
    // -----------------------------------------------------------------------

    getObject(buffer: Buffer, counter = true, isn?: number): AdabasRecord {
        this.setOffset(counter);
        const obj: AdabasRecord = isn !== undefined ? { ISN: isn } : {};

        for (const mapData of this._list) {
            if (mapData.map) {
                if (mapData.occ) {
                    // Periodic group
                    let offset = mapData.offset;
                    let count = mapData.occ;

                    if (counter) {
                        count = Math.min(buffer.readInt8(offset), count);
                        offset++;
                    }

                    const periodic: AdabasRecord[] = [];

                    for (const peData of mapData.map._list) {
                        const peCnt: number[] = [];

                        if (peData.occ) {
                            // MU within PE — read per-occurrence counters
                            for (let j = 0; j < count; j++) {
                                peCnt.push(counter ? buffer.readInt8(offset + j) : peData.occ);
                            }
                            if (counter) offset += mapData.occ;
                        }

                        for (let i = 0; i < count; i++) {
                            if (!periodic[i]) periodic[i] = {};

                            if (peData.occ) {
                                const muValues: ScalarFieldValue[] = [];
                                for (let j = 0; j < peCnt[i]; j++) {
                                    muValues.push(this.extractField(peData, buffer,
                                        offset + (i * peData.occ + j) * peData.length));
                                }
                                periodic[i][peData.longName] = muValues;
                            } else {
                                periodic[i][peData.longName] = this.extractField(peData, buffer,
                                    offset + i * peData.length);
                            }
                        }

                        offset += peData.length * mapData.occ;
                    }

                    obj[mapData.longName] = periodic;
                } else {
                    // Regular group
                    obj[mapData.longName] = mapData.map.getObject(
                        buffer.slice(mapData.offset, mapData.offset + mapData.map.getRbLen())
                    );
                }
            } else if (mapData.occ) {
                // Multiple-value field
                let index = mapData.occ;
                let offset = mapData.offset;

                if (counter) {
                    index = Math.min(buffer.readInt8(offset), index);
                    offset++;
                }

                const multi: ScalarFieldValue[] = [];
                for (let i = 0; i < index; i++) {
                    multi.push(this.extractField(mapData, buffer, offset + i * mapData.length));
                }
                obj[mapData.longName] = multi;
            } else {
                // Regular field
                obj[mapData.longName] = this.extractField(mapData, buffer);
            }
        }

        return obj;
    }

    // -----------------------------------------------------------------------
    // Validation
    // -----------------------------------------------------------------------

    validate(object: AdabasRecord): void {
        const result = this.schema.validate(object);
        if (result.error) throw new Error(result.error.message);
    }

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------

    setPeriodicDefault(object: AdabasRecord, list = this._list, occ = 0): void {
        for (const item of list) {
            if (occ > 0 && item.format === 'P') {
                const field = object[item.longName] as Array<number | AdabasRecord>;
                for (let index = 0; index < occ; index++) {
                    if (item.type === TYPE_REGULAR) {
                        (field as number[])[index] = 0;
                    } else if (item.type === TYPE_MULTIPLE) {
                        const muField = (field[index] as AdabasRecord).MU as number[];
                        for (let i = 0; i < item.occ; i++) {
                            muField[i] = 0;
                        }
                    }
                }
            }
            if (item.type === TYPE_PERIODIC) {
                this.setPeriodicDefault(object, item.map._list, item.occ);
            }
        }
    }

    toJs(): string {
        return this.printMap(this);
    }

    printMap(map: AdabasMap, name = 'Map'): string {
        let line = `const ${name} = new AdabasMap()\n`;
        const subMaps: string[] = [];

        for (const element of map._list) {
            logger.debug({ element }, 'printMap element');
            switch (element.type) {
                case TYPE_REGULAR:
                case TYPE_MULTIPLE:
                    line += `\t.${this.getFieldFormat(element.format)}(${element.length}, '${element.shortName}'`;
                    line += this.optionsToString(element.options);
                    line += ')\n';
                    break;

                case TYPE_GROUP:
                case TYPE_PERIODIC: {
                    const mapName = element.longName || element.shortName;
                    line += `\t.group(${mapName}, '${element.shortName}'`;
                    line += this.optionsToString(element.options);
                    line += ')\n';
                    subMaps.push(this.printMap(element.map, mapName));
                    break;
                }

                default:
                    break;
            }
        }

        return subMaps.join('') + line + ';\n';
    }

    optionsToString(options?: MapOption): string {
        if (!options) return '';

        const pairs = Object.entries(options).map(([key, val]) =>
            key === 'occ' ? `${key}: ${val}` : `${key}: '${val}'`
        );

        return pairs.length > 0 ? `, { ${pairs.join(', ')} }` : '';
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private appendSchema(name: string, schema: Joi.Schema): void {
        this.schema = this.schema.append({ [name]: schema });
    }

    private initBuffer(size: number): Buffer {
        const buffer = Buffer.alloc(size);

        for (const item of this.list) {
            switch (item.type) {
                case TYPE_REGULAR:
                    this.setBuffer(buffer, this.getDefault(item), item, item.offset);
                    break;

                case TYPE_MULTIPLE:
                    for (let i = 0; i < item.occ; i++) {
                        this.setBuffer(buffer, this.getDefault(item), item, item.offset + i * item.length);
                    }
                    break;

                case TYPE_PERIODIC:
                    for (const peItem of item.map.list) {
                        for (let index = 0; index < item.occ; index++) {
                            if (peItem.occ) {
                                for (let i = 0; i < peItem.occ; i++) {
                                    this.setBuffer(buffer, this.getDefault(peItem), peItem,
                                        item.offset + peItem.offset + (index * peItem.occ + i) * peItem.length);
                                }
                            } else {
                                this.setBuffer(buffer, this.getDefault(peItem), peItem,
                                    item.offset + peItem.offset + index * peItem.length);
                            }
                        }
                    }
                    break;

                default:
                    break;
            }
        }
        return buffer;
    }

    private getDefault(item: MapData): ScalarFieldValue {
        switch (item.format) {
            case 'A': return ''.padEnd(item.length);
            case 'B': return Buffer.alloc(item.length);
            default: return 0;
        }
    }

    private setBuffer(buffer: Buffer, value: ScalarFieldValue, item: MapData, offset: number): void {
        switch (item.format) {
            case 'A': // alpha
            case 'W': // wide
                buffer.write(value as string, offset, item.length);
                break;

            case 'F': // fixed
                switch (item.length) {
                    case 1: buffer.writeInt8(value as number, offset); break;
                    case 2: buffer.writeInt16LE(value as number, offset); break;
                    case 4: buffer.writeInt32LE(value as number, offset); break;
                    case 8: new Int64LE(value as number).toBuffer().copy(buffer, offset, 0, item.length); break;
                }
                break;

            case 'P': { // packed
                let packed = 0;
                // check type of value
                if (value instanceof Date) {
                    packed = getNumberFromDate(value, item.options?.format ?? '');
                }
                else {
                    packed = item.options?.prec
                        ? (value as number) * Math.pow(10, item.options.prec)
                        : (value as number);
                }
                let v = packed < 0 ? -packed : packed;
                const start = offset + item.length - 2;

                buffer[offset + item.length - 1] = packed > 0 ? 0xc : 0xb;

                let x = v % 10;
                v = (v - x) / 10;
                buffer[offset + item.length - 1] |= (x << 4);

                for (let i = start; i >= offset; i--) {
                    x = v % 10;
                    v = (v - x) / 10;
                    buffer[i] = x;
                    x = v % 10;
                    v = (v - x) / 10;
                    buffer[i] |= (x << 4);
                }
                break;
            }

            case 'U': { // unpacked
                let unpacked = 0;
                if (value instanceof Date) {
                    unpacked = getNumberFromDate(value, item.options?.format ?? '');
                }
                else {
                    unpacked = item.options?.prec
                    ? (value as number) * Math.pow(10, item.options.prec)
                    : (value as number);
                }
                buffer.write(String(unpacked).padStart(item.length, '0'), offset, item.length);
                break;
            }

            case 'G': // float
                if (item.length === 4) {
                    buffer.writeFloatLE(value as number, offset);
                } else {
                    buffer.writeDoubleLE(value as number, offset);
                }
                break;

            case 'B': // binary
                if (item.options?.format) {
                    switch (item.length) {
                        case 1: buffer.writeInt8(value as number, offset); break;
                        case 2: buffer.writeInt16LE(value as number, offset); break;
                        case 4: buffer.writeInt32LE(value as number, offset); break;
                        case 8: new Int64LE(value as number).toBuffer().copy(buffer, offset, 0, item.length); break;
                    }
                } else {
                    (value as Buffer).copy(buffer, offset, 0, item.length);
                }
                break;

            default:
                break;
        }
    }

    private extractField(mapData: MapData, buffer: Buffer, off?: number): ScalarFieldValue {
        const offset = off ?? mapData.offset;

        switch (mapData.format) {
            case 'A': // alpha
            case 'W': { // wide
                const raw = buffer.toString('utf8', offset, offset + mapData.length);
                const nullAt = raw.indexOf('\0');
                return nullAt === -1 ? raw.trim() : raw.slice(0, nullAt).trim();
            }

            case 'F': // fixed
                switch (mapData.length) {
                    case 1: return buffer.readInt8(offset);
                    case 2: return buffer.readInt16LE(offset);
                    case 4: return buffer.readInt32LE(offset);
                    case 8: return new Int64LE(buffer, offset).toNumber();
                }
                break;

            case 'P': { // packed
                let base = 1;
                let value = 0;
                let sign = 1;

                for (let i = offset + mapData.length; i > offset; i--) {
                    const lo = buffer[i - 1] & 0x0f;
                    if (lo < 0xa) {
                        value += lo * base;
                        base *= 10;
                    } else {
                        if (lo === 0xb || lo === 0xd) sign = -1;
                        base = 1;
                    }
                    const hi = (buffer[i - 1] & 0xf0) >> 4;
                    value += hi * base;
                    base *= 10;
                }
                value *= sign;

                if (mapData.options?.format === 'date' || mapData.options?.format === 'time') {
                    const date = new Date('0000-01-01');
                    if (mapData.options.format === 'date') {
                        date.setTime(date.getTime() + value * 60 * 60 * 24 * 1000);
                    } else {
                        date.setTime(value);
                    }
                    return date;
                }

                return mapData.options?.prec ? value * Math.pow(10, mapData.options.prec) : value;
            }

            case 'U': { // unpacked
                const v = parseInt(buffer.toString('utf8', offset, offset + mapData.length), 10);

                if (mapData.options?.format === 'date' || mapData.options?.format === 'time') {
                    const date = new Date('0000-01-01');
                    if (mapData.options.format === 'date') {
                        date.setDate(v);
                    } else {
                        date.setTime(v);
                    }
                    return date;
                }

                return mapData.options?.prec ? v * Math.pow(10, mapData.options.prec) : v;
            }

            case 'G': // float
                return mapData.length === 4
                    ? buffer.readFloatLE(offset)
                    : buffer.readDoubleLE(offset);

            case 'B': { // binary
                // FIX: original code was missing `break` statements — all cases fell through,
                // returning the Int64 result regardless of length.
                if (mapData.options?.format === 'number') {
                    switch (mapData.length) {
                        case 1: return buffer.readInt8(offset);
                        case 2: return buffer.readInt16LE(offset);
                        case 4: return buffer.readInt32LE(offset);
                        case 8: return new Int64LE(buffer, offset).toNumber();
                    }
                }
                const bin = Buffer.alloc(mapData.length);
                buffer.copy(bin, 0, offset);
                return bin;
            }

            default:
                break;
        }

        // Unreachable under normal usage — all known formats are handled above.
        throw new Error(`Unknown field format '${mapData.format}' for field '${mapData.longName}'.`);
    }

    private getFieldFormat(code: string): string {
        switch (code) {
            case 'A': return FIELD_FORMAT_ALPHA;
            case 'B': return FIELD_FORMAT_BINARY;
            case 'F': return FIELD_FORMAT_FIXED;
            case 'G': return FIELD_FORMAT_FLOAT;
            case 'P': return FIELD_FORMAT_PACKED;
            case 'U': return FIELD_FORMAT_UNPACKED;
            case 'W': return FIELD_FORMAT_WIDE;
            default: throw new Error(`Unknown field format '${code}'.`);
        }
    }

    private setOffset(counter = false, occ = 1): number {
        let offset = 0;
        for (const data of this.list) {
            data.offset = offset;
            switch (data.type) {
                case TYPE_REGULAR:
                    offset += data.length * occ;
                    break;
                case TYPE_MULTIPLE:
                    offset += data.length * data.occ * occ;
                    if (counter) offset += occ;
                    break;
                case TYPE_GROUP:
                    offset += data.map.setOffset(counter, occ) * occ;
                    break;
                case TYPE_PERIODIC:
                    offset += data.map.setOffset(counter, data.occ);
                    if (counter) offset++;
                    break;
                default:
                    break;
            }
        }
        return offset;
    }
}