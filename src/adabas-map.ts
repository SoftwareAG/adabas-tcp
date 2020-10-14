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

import Joi = require('joi');

import { Int64LE } from 'int64-buffer';

import { MapData, MapOption } from './interfaces';

// enum ItemType { Regular, Multiple, Periodic, Group }; // do be done later

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

export class AdabasMap {

    private _fnr: number;
    private _list: MapData[];
    private schema: any;

    constructor(fnr = 0) {
        this._fnr = fnr;
        this._list = [];
        this.schema = Joi.object(); // schema for joi validation
    }

    get fnr(): number {
        return this._fnr;
    }

    set fnr(fnr: number) {
        this._fnr = fnr;
    }

    get list(): MapData[] {
        return this._list;
    }

    add(obj: MapData): AdabasMap {
        this._list.push(obj);
        return this;
    }

    getField(name: string): MapData | null {
        for (let index = 0; index < this._list.length; index++) {
            const f = this._list[index];
            if (f.longName === name) {
                return f;
            }
            if (f.type === TYPE_GROUP) {
              if (f.map) {
                const field = f.map.getField(name);
                if (field != null) {
                    return field;
                }
              }
            }
        }
        return null;
    }

    field(shortName: string, length: number, format: string, validate: any, options?: MapOption): AdabasMap {
        const opt = options || { occ: 0, name: shortName };
        const occ = opt.occ || 0;
        if (shortName.length != 2) throw new Error('Only two byte for Short Name valid.');
        if (occ < 0) throw new Error('Occurrence must not be negative.');

        const longName = opt.name || shortName;
        const object: MapData = { type: TYPE_REGULAR, shortName, longName, format, length, options };

        if (occ === 0) {
            object['type'] = TYPE_REGULAR;
            this._list.push(object);
            this.appendSchema(longName, validate);
        } else {
            object['type'] = TYPE_MULTIPLE;
            object['occ'] = occ;
            this._list.push(object);
            this.appendSchema(longName, Joi.array().max(occ));
        }
        return this;
    }

    alpha(length: number, shortName: string, options?: MapOption): AdabasMap {
        this.field(shortName, length, 'A', Joi.string(), options);
        return this;
    }

    wide(length: number, shortName: string, options?: MapOption): AdabasMap {
        this.field(shortName, length, 'W', Joi.string(), options);
        return this;
    }

    binary(length: number, shortName: string, options?: MapOption): AdabasMap {
        if (options && options.format && options.format === 'number' && ![1, 2, 4, 8].includes(length)) throw new Error('Number only allowed for binary of length 1, 2, 4 and 8');
        const joi = options && options.format && options.format === 'number' ? Joi.number() : Joi.binary();
        this.field(shortName, length, 'B', joi, options);
        return this;
    }

    fixed(length: number, shortName: string, options?: MapOption): AdabasMap {
        if (![1, 2, 4, 8].includes(length)) throw new Error('Fields of type fixed must have a length of 1, 2, 4 or 8.');
        this.field(shortName, length, 'F', Joi.number(), options);
        return this;
    }

    float(length: number, shortName: string, options?: MapOption): AdabasMap {
        if (![4, 8].includes(length)) throw new Error('Fields of type float must have a length of 4 or 8.');
        this.field(shortName, length, 'G', Joi.number(), options);
        return this;
    }

    packed(length: number, shortName: string, options?: MapOption): AdabasMap {
        const joi = options && options.format && (options.format === 'date' || options.format === 'time') ? Joi.date() : Joi.number();
        this.field(shortName, length, 'P', joi, options);
        return this;
    }

    unpacked(length: number, shortName: string, options?: MapOption): AdabasMap {
        const joi = options && options.format && (options.format === 'date' || options.format === 'time') ? Joi.date() : Joi.number();
        this.field(shortName, length, 'U', joi, options);
        return this;
    }

    group(map: AdabasMap, shortName: string, options?: MapOption): AdabasMap {
        const occ = options && options.occ ? options.occ : 0;
        if (occ < 0) throw new Error('Occurrence must not be negative.');

        const longName = options && options.name ? options.name : shortName;
        if (occ == 0) {
            this._list.push({ type: TYPE_GROUP, shortName, longName, format: 'GR', map, options });
            this.appendSchema(longName, Joi.object());
        }
        else {
            // recalulate offset in pe map
            // let len = 0;
            // let offset = 0;
            // map._list.forEach(item => {
            //     item.offset = offset + len * occ;
            //     offset += len * occ;
            //     len = item.occ ? item.length * item.occ : item.length;
            // });
            this._list.push({ type: TYPE_PERIODIC, shortName, longName, format: 'PE', occ, map, options });
            this.appendSchema(longName, Joi.array().max(occ));
        }
        return this;
    }

    getFb(counter = true, occ = 0, group = false): string {
        let fb = '';
        let occString = '';
        if (occ > 0) {
            occString = '1-' + occ;
        }
        this._list.forEach((item) => {
            if (fb.length > 0) {
                fb += ',';
            }
            switch (item.type) {
                case TYPE_REGULAR:
                    fb += item.shortName + occString + ',' + item.length + ',' + item.format;
                    break;
                case TYPE_MULTIPLE:
                    if (counter) fb += item.shortName + occString + 'C,1,B,'
                    fb += item.shortName + occString;
                    if (occ > 0) {
                        fb += '(';
                    }
                    fb += '1-' + item.occ;
                    if (occ > 0) {
                        fb += ')';
                    }
                    fb += ',' + item.length + ',' + item.format;
                    break;
                case TYPE_PERIODIC:
                    if (counter) fb += item.shortName + occString + 'C,1,B,';
                    fb += item.map.getFb(counter, item.occ, true);
                    break;
                case TYPE_GROUP:
                    fb += item.map.getFb(counter, 0, true);
                    break;
            }
        });
        if (!group) {
            fb += '.';
        }
        return fb;
    }

    getRbLen(counter = 1): number {
        let len = 0;
        // console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~', this._list.length);

        this._list.forEach((item) => {
            switch (item.type) {
                case TYPE_REGULAR:
                    len += item.length;
                    break;
                case TYPE_MULTIPLE:
                    len += item.length * item.occ + counter;
                    break;
                case TYPE_PERIODIC:
                    len += item.map.getRbLen(counter) * item.occ + counter;
                    // console.log('len after', len);
                    break;
                case TYPE_GROUP:
                    len += item.map.getRbLen(counter);
                    break;
            }
        });
        return len;
    }

    getRb(object: any, counter = false): Buffer {
        this.setOffset(counter);
        const cnt = counter ? 1 : 0;
        const buffer = this.initBuffer(this.getRbLen(cnt));
        // const buffer = Buffer.alloc(this.getRbLen(cnt));
        Object.keys(object).forEach((key) => {
            const item = this._list.find((item) => {
                return item.longName === key;
            });
            if (item) {
                switch (item.type) {
                    case TYPE_REGULAR:
                        this.setBuffer(buffer, object[key], item, item.offset);
                        break;
                    case TYPE_MULTIPLE:
                        object[key].forEach((value: any, index: number) => {
                            this.setBuffer(buffer, value, item, item.offset + index * item.length);
                        });
                        break;
                    case TYPE_GROUP:
                        const grBuffer = item.map.getRb(object[key]);
                        grBuffer.copy(buffer, item.offset, 0, grBuffer.length);
                        break;
                    case TYPE_PERIODIC:
                        object[key].forEach((value: any, index: number) => {
                            Object.keys(value).forEach((peKey) => {
                                const peItem = item.map._list.find((item) => {
                                    return item.longName === peKey;
                                });
                                if (peItem) {
                                    if (peItem.occ) { // mu within pe
                                        for (let i = 0; i < value[peKey].length; i++) {
                                            this.setBuffer(buffer, value[peKey][i], peItem, item.offset + peItem.offset + (index * peItem.occ + i) * peItem.length);
                                        }
                                    }
                                    else {
                                        this.setBuffer(buffer, value[peKey], peItem, item.offset + peItem.offset + index * peItem.length);
                                    }
                                }
                            });
                        });
                        break;
                }
            }
        })
        return buffer;
    }

    private appendSchema(name: string, object: any) {
        const obj: any = {};
        obj[name] = object;
        this.schema = this.schema.append(obj);
    }

    private initBuffer(size: number): Buffer {
        const buffer = Buffer.alloc(size);
        this.list.forEach(item => {
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
                    item.map.list.forEach(peItem => {
                        for (let index = 0; index < item.occ; index++) {
                            if (peItem.occ) { // mu within pe
                                for (let i = 0; i < peItem.occ; i++) {
                                    this.setBuffer(buffer, this.getDefault(peItem), peItem, item.offset + peItem.offset + (index * peItem.occ + i) * peItem.length);
                                }
                            }
                            else {
                                this.setBuffer(buffer, this.getDefault(peItem), peItem, item.offset + peItem.offset + index * peItem.length);
                            }
                        }

                    });
                    break;
                default:
                    break;
            }
        });
        return buffer;
    }

    private getDefault(item: MapData): any {
        switch (item.format) {
            case 'A':
                return ''.padEnd(item.length);
            case 'B':
                return Buffer.alloc(item.length);
            default:
                return 0;
        }

    }

    private setBuffer(buffer: Buffer, value: any, item: MapData, offset: number): void {
        switch (item.format) {
            case 'A': // alpha
            case 'W': // wide
                buffer.write(value, offset, item.length);
                break;
            case 'F': // fix
                switch (item.length) {
                    case 1:
                        buffer.writeInt8(value, offset);
                        break;
                    case 2:
                        buffer.writeInt16LE(value, offset);
                        break;
                    case 4:
                        buffer.writeInt32LE(value, offset);
                        break;
                    case 8:
                        new Int64LE(value).toBuffer().copy(buffer, offset, 0, item.length);
                        break;
                }
                break;
            case 'P': // packed
                let packed = 0;

                // if (item.options && item.options.format) {
                //     const date = new Date('0000-01-01');
                //     switch (item.options.format) {
                //         case 'date':
                //             packed = parseInt((value - date) / (1000 * 60 * 60 * 24));
                //             break;
                //         case 'time':
                //             packed = parseInt(value - date.getTime());
                //             break;
                //     }
                // } 
                // else {
                packed = (item.options && item.options.prec) ? value * Math.pow(10, item.options.prec) : value;
                // }

                let v = packed < 0 ? -packed : packed;
                let x;
                const start = offset + item.length - 2;
                if (packed > 0) {
                    buffer[offset + item.length - 1] = 0xc;
                }
                else {
                    buffer[offset + item.length - 1] = 0xb;
                }
                x = (v % 10);
                v = (v - x) / 10;
                buffer[offset + item.length - 1] |= (x << 4);
                for (let i = start; i >= offset; i--) {
                    x = (v % 10);
                    v = (v - x) / 10;
                    buffer[i] = x;
                    x = (v % 10);
                    v = (v - x) / 10;
                    buffer[i] |= (x << 4);
                }
                break;
            case 'U': // unpacked
                let unpacked = 0;
                // if (format) {
                //     const date1 = new Date('0000-01-01');
                //     switch (format) {
                //         case 'date':
                //             packed = parseInt((value - date1) / (1000 * 60 * 60 * 24));
                //             break;
                //         case 'time':
                //             packed = parseInt(value - date1);
                //             break;
                //     }
                // } else {
                unpacked = (item.options && item.options.prec) ? value * Math.pow(10, item.options.prec) : value;
                // }
                const val = '' + unpacked;
                buffer.write(val.padStart(item.length, '0'), offset, item.length);
                break;
            case 'G': // float
                if (item.length === 4) {
                    buffer.writeFloatLE(value, offset);
                } else {
                    buffer.writeDoubleLE(value, offset);
                }
                break;
            case 'B': // binary
                if (item.options && item.options.format) {
                    switch (item.length) {
                        case 1:
                            buffer.writeInt8(value, offset);
                            break;
                        case 2:
                            buffer.writeInt16LE(value, offset);
                            break;
                        case 4:
                            buffer.writeInt32LE(value, offset);
                            break;
                        case 8:
                            new Int64LE(value).toBuffer().copy(buffer, offset, 0, item.length);
                            break;
                    }
                }
                else {
                    value.copy(buffer, offset, 0, item.length);
                }
                break;

            default:
                break;
        }
    }

    getObject(buffer: Buffer, counter = true, isn?: number): any {
        this.setOffset(counter);
        const obj: any = isn ? { ISN: isn } : {};
        this._list.forEach(mapData => {
            if (mapData.map) {
                if (mapData.occ) {
                    let count = mapData.occ;
                    let offset = mapData.offset;
                    if (counter) { // read counter field
                        offset = mapData.offset;
                        count = (buffer.readInt8(offset) < count) ? buffer.readInt8(offset) : count;
                        offset++;
                    }
                    const periodic: any = [];
                    mapData.map._list.forEach(peData => {
                        const peCnt: number[] = [];
                        if (peData.occ) {
                            // get count fields for a mu within pe
                            if (counter) {
                                for (let j = 0; j < count; j++) {
                                    peCnt.push(buffer.readInt8(offset + j));
                                }
                                offset += mapData.occ;
                            }
                            else {
                                for (let j = 0; j < count; j++) {
                                    peCnt.push(peData.occ);
                                }
                            }
                        }
                        for (let i = 0; i < count; i++) {
                            if (!periodic[i]) periodic[i] = {};
                            if (peData.occ) {
                                // mu within pe
                                periodic[i][peData.longName] = [];
                                for (let j = 0; j < peCnt[i]; j++) {
                                    periodic[i][peData.longName].push(this.extractField(peData, buffer, offset + (i * peData.occ + j) * peData.length));
                                }
                            }
                            else {
                                periodic[i][peData.longName] = this.extractField(peData, buffer, offset + i * peData.length);
                            }
                        }
                        offset += peData.length * mapData.occ;
                    });
                    obj[mapData.longName] = periodic;
                }
                else {
                    obj[mapData.longName] = mapData.map.getObject(buffer.slice(mapData.offset, mapData.offset + mapData.map.getRbLen()));
                }
            }
            else {
                if (mapData.occ) {
                    const multi = [];
                    let index = mapData.occ;
                    let offset = mapData.offset;
                    if (counter) { // read counter field
                        index = (buffer.readInt8(offset) < index) ? buffer.readInt8(offset) : index;
                        offset++;
                    }
                    for (let i = 0; i < index; i++) {
                        multi.push(this.extractField(mapData, buffer, offset + i * mapData.length));
                    }
                    obj[mapData.longName] = multi;
                }
                else {
                    obj[mapData.longName] = this.extractField(mapData, buffer);
                }
            }
        });
        return obj;
    }

    private extractField(mapData: MapData, buffer: Buffer, off?: number): any {
        const offset = off || mapData.offset;
        let returnValue: any = undefined;
        switch (mapData.format) {
            case 'A': // alpha
            case 'W': // wide
                const alpha = buffer.toString(undefined, offset, offset + mapData.length);
                const index = alpha.indexOf('\0');
                returnValue = index == -1 ? alpha.trim() : alpha.slice(0, index).trim();
                break;
            case 'F': // fix
                switch (mapData.length) {
                    case 1:
                        returnValue = buffer.readInt8(offset);
                        break;
                    case 2:
                        returnValue = buffer.readInt16LE(offset);
                        break;
                    case 4:
                        returnValue = buffer.readInt32LE(offset);
                        break;
                    case 8:
                        returnValue = new Int64LE(buffer, offset).toNumber();
                        break;
                }
                break;
            case 'P': // packed
                let base = 1;
                let value = 0;
                let sign = 1;

                for (let i = offset + mapData.length; i > offset; i--) {
                    let h = buffer[i - 1] & 0x0f;
                    if (h < 0xa) {
                        value += h * base;
                        base *= 10;
                    } else {
                        if (h == 0xb || h == 0xd) {
                            sign = -1;
                        }
                        base = 1;
                    }
                    h = (buffer[i - 1] & 0xf0) >> 4;
                    value += h * base;
                    base *= 10;
                }
                value *= sign;
                if (mapData.options && mapData.options.format) {
                    const date = new Date('0000-01-01');
                    switch (mapData.options.format) {
                        case 'date':
                            // set time as milliseconds of day 0000-01-01
                            const ms = date.getTime() + value * 60 * 60 * 24 * 1000;
                            date.setTime(ms);
                            break;
                        case 'time':
                            date.setTime(value);
                            break;
                    }
                    return date;
                }
                returnValue = (mapData.options && mapData.options.prec) ? value * Math.pow(10, mapData.options.prec) : value;
                break;
            case 'U': // unpacked
                const v = parseInt(buffer.toString(undefined, offset, (offset + mapData.length)));
                if (mapData.options && mapData.options.format) {
                    const date = new Date('0000-01-01');
                    switch (mapData.options.format) {
                        case 'date':
                            date.setDate(v);
                            break;
                        case 'time':
                            date.setTime(v);
                            break;
                    }
                    returnValue = date;
                }
                else {
                    returnValue = (mapData.options && mapData.options.prec) ? v * Math.pow(10, mapData.options.prec) : v;
                }
                break;
            case 'G': // float
                if (mapData.length === 4) {
                    returnValue = buffer.readFloatLE(offset);
                } else {
                    returnValue = buffer.readDoubleLE(offset);
                }
                break;
            case 'B': // binary
                if (mapData.options && mapData.options.format && mapData.options.format === 'number') {
                    switch (mapData.length) {
                        case 1:
                            returnValue = buffer.readInt8(offset);
                        case 2:
                            returnValue = buffer.readInt16LE(offset);
                        case 4:
                            returnValue = buffer.readInt32LE(offset);
                        case 8:
                            returnValue = new Int64LE(buffer, offset).toNumber();
                    }
                }
                else {
                    const value = Buffer.alloc(mapData.length);
                    buffer.copy(value, 0, offset);
                    returnValue = value;
                }
                break;
            default:
                break;
        }
        return returnValue;
    }

    validate(object: any): void {
        const result = this.schema.validate(object);
        if (result.error) {
            throw new Error(result.error.message);
        }
    }

    setPeriodicDefault(object: any, list = this._list, occ = 0): void {
        list.forEach((item) => {
            if (occ > 0 && item.format === 'P') {
                for (let index = 0; index < occ; index++) {
                    if (item.type === TYPE_REGULAR) {
                        object[item.longName][index] = 0;
                    }
                    if (item.type === TYPE_MULTIPLE) {
                        for (let i = 0; i < item.occ; i++) {
                            object[item.longName][index].MU[i] = 0;
                        }
                    }
                }
            }
            if (item.type === TYPE_PERIODIC) {
                this.setPeriodicDefault(object, item.map._list, item.occ);
            }
        });
    }

    toJs(): string {
        return this.printMap(this);
    }

    printMap(map: AdabasMap, name = 'Map'): string {
        let line = 'const ' + name + ' = new AdabasMap()\n';
        const subMap: any[] = [];
        map._list.forEach(element => {
            // console.log(element);
            switch (element.type) {
                case TYPE_REGULAR:
                case TYPE_MULTIPLE:
                    line += '\t.' + this.getFieldFormat(element.format) + '(' + element.length + ', \'' + element.shortName + '\'';
                    line += this.optionsToString(element.options);
                    line += ')\n';
                    break;
                case TYPE_GROUP:
                case TYPE_PERIODIC:
                    const mapName = element.longName ? element.longName : element.shortName;
                    line += '\t.group(' + mapName + ', \'' + element.shortName + '\'';
                    line += this.optionsToString(element.options);
                    line += ')\n';
                    subMap.push(this.printMap(element.map, mapName));
                    break;
                default:
                    break;
            }
        });
        line += ';\n';
        let result = '';
        subMap.forEach(l => {
            result += l;
        });
        result += line;
        return result;
    }

    optionsToString(options: any): string {
        if (!options) return '';
        let option = '';
        Object.keys(options).forEach(function (key) {
            if (option.length === 0) {
                option += ', { ';
            } else {
                option += ', ';
            }
            if (key === 'occ') option += key + ': ' + options[key];
            else option += key + ': \'' + options[key] + '\'';
        });
        if (option.length > 0) option += ' }';
        return option;
    }

    private getFieldFormat(code: string): string {
        switch (code) {
            case 'A': return (FIELD_FORMAT_ALPHA);
            case 'B': return (FIELD_FORMAT_BINARY);
            case 'F': return (FIELD_FORMAT_FIXED);
            case 'G': return (FIELD_FORMAT_FLOAT);
            case 'P': return (FIELD_FORMAT_PACKED);
            case 'U': return (FIELD_FORMAT_UNPACKED);
            case 'W': return (FIELD_FORMAT_WIDE);
            default: throw new Error('Unknown field format \'' + code + '\'');
        };
    }

    private setOffset(counter = false, occ = 1): number {
        let offset = 0;
        this.list.forEach(data => {
            data.offset = offset;
            // calculate offset for next field
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
        });
        return offset;
    }
}