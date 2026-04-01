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

import { AdabasMap } from './adabas-map';
import { FdtField } from './interfaces';
import { AdabasConnect } from './adabas-connect';
import { AdabasTcp } from './adabas-tcp';
import { AdabasBufferStructure } from './adabas-buffer-structure';
import { AdabasCall, LogEvent } from './adabas-call';
import { ControlBlock } from './control-block';
import logger from './logger';

// ---------------------------------------------------------------------------
// FDT wire-format constants
// ---------------------------------------------------------------------------

/** Size of the read buffer for the LF (list fields) command. */
const LF_BUFFER_SIZE = 0x10000;

/** Byte offset in the response buffer where the field count is stored. */
const FDT_FIELD_COUNT_OFFSET = 2;

/** Byte offset where the field descriptor array starts. */
const FDT_FIELDS_START = 4;

/** Size in bytes of each FDT field descriptor entry. */
const FDT_ENTRY_SIZE = 8;

/** Encoding used for all string reads from the FDT response buffer. */
const ENCODING: BufferEncoding = 'utf8';

// Bit masks for FDT option byte 1
const OPT1_UQ = 0x01;
const OPT1_PE = 0x08;
const OPT1_NU = 0x10;
const OPT1_MU = 0x20;
const OPT1_FI = 0x40;
const OPT1_DE = 0x80;

// Bit masks for FDT option byte 2
const OPT2_NC = 0x01;
const OPT2_NN = 0x02;
const OPT2_LB = 0x04;
const OPT2_LA = 0x08;
const OPT2_XI = 0x10;
const OPT2_HF = 0x20;
const OPT2_NV = 0x40;
const OPT2_NB = 0x80;

// ---------------------------------------------------------------------------
// Field-format code → AdabasMap method name mapping
// ---------------------------------------------------------------------------

type AdabasMapMethodName = 'alpha' | 'binary' | 'float' | 'fixed' | 'packed' | 'unpacked' | 'wide';

const FIELD_FORMAT_TABLE: Readonly<Record<string, AdabasMapMethodName>> = {
    A: 'alpha',
    B: 'binary',
    F: 'float',
    G: 'fixed',
    P: 'packed',
    U: 'unpacked',
    W: 'wide',
    N: 'unpacked',
    I: 'fixed',
};

// ---------------------------------------------------------------------------
// FileDescriptionTable
// ---------------------------------------------------------------------------

export class FileDescriptionTable {

    private readonly client: AdabasTcp;
    private readonly adabasCall: AdabasCall;

    constructor(host: string, port: number, log: LogEvent[] = []) {
        this.client = new AdabasTcp(host, port);
        this.adabasCall = new AdabasCall(this.client, log);
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    async getFDT(fnr: number): Promise<FdtField[]> {
        const uuid = await new AdabasConnect(this.client).connect();

        const cb = new ControlBlock();
        const abda = new AdabasBufferStructure();
        abda.add('R', Buffer.alloc(LF_BUFFER_SIZE));

        cb.init({ fnr, cmd: 'LF', cop2: 'S' });
        const result = await this.adabasCall.call({ cb, abda, uuid });

        const rb = result.abda.getBuffer('R');
        const numberOfFields = rb.readUInt16LE(FDT_FIELD_COUNT_OFFSET);
        const fdt = this.parseFields(rb, numberOfFields);

        // Close session
        cb.init({ cmd: 'CL' });
        await this.adabasCall.call({ cb, abda: new AdabasBufferStructure(), uuid });
        this.client.close();

        return fdt;
    }

    async getMap(fnr: number): Promise<AdabasMap> {
        const fdt = await this.getFDT(fnr);
        const map = this.objectToMap(fdt);
        map.fnr = fnr;
        return map;
    }

    // -----------------------------------------------------------------------
    // Private — FDT parsing
    // -----------------------------------------------------------------------

    private parseFields(rb: Buffer, count: number): FdtField[] {
        const fdt: FdtField[] = [];

        for (let index = 0; index < count; index++) {
            const offset = FDT_FIELDS_START + index * FDT_ENTRY_SIZE;
            const indicator = rb.toString(ENCODING, offset, offset + 1);
            const name = rb.toString(ENCODING, offset + 1, offset + 3);
            const option1 = rb.readUInt8(offset + 3);
            const level = rb.readUInt8(offset + 4);
            const length = rb.readUInt8(offset + 5);
            const format = rb.toString(ENCODING, offset + 6, offset + 7);
            const option2 = rb.readUInt8(offset + 7);

            if (indicator !== 'F') continue;

            const isPe = (option1 & OPT1_PE) !== 0 && level === 1;
            const isGr = !isPe && length === 0 && format === ' ';

            const options = this.parseOptions(option1, option2);
            const field: FdtField = { level, name };

            if (isPe) field.type = 'PE';
            else if (isGr) field.type = 'GR';
            else {
                field.format = format;
                field.length = length;
            }

            if (options.length > 0) field.options = options;

            fdt.push(field);
        }

        return fdt;
    }

    private parseOptions(option1: number, option2: number): string[] {
        const opts: string[] = [];

        if (option1 & OPT1_UQ) opts.push('UQ');
        if (option1 & OPT1_NU) opts.push('NU');
        if (option1 & OPT1_MU) opts.push('MU');
        if (option1 & OPT1_FI) opts.push('FI');
        if (option1 & OPT1_DE) opts.push('DE');
        if (option2 & OPT2_NC) opts.push('NC');
        if (option2 & OPT2_NN) opts.push('NN');
        if (option2 & OPT2_LB) opts.push('LB');
        if (option2 & OPT2_LA) opts.push('LA');
        if (option2 & OPT2_XI) opts.push('XI');
        if (option2 & OPT2_HF) opts.push('HF');
        if (option2 & OPT2_NV) opts.push('NV');
        if (option2 & OPT2_NB) opts.push('NB');

        return opts;
    }

    // -----------------------------------------------------------------------
    // Private — map construction
    // -----------------------------------------------------------------------

    private objectToMap(fields: FdtField[]): AdabasMap {
        const map = new AdabasMap();
        let current: AdabasMap = map;

        for (const element of fields) {
            const longName = element.name; // longName alias reserved for future mapping support

            if (element.format !== undefined) {
                const methodName = FIELD_FORMAT_TABLE[element.format];
                if (!methodName) {
                    logger.warn({ name: element.name, format: element.format }, 'Unknown field format — skipping');
                    continue;
                }

                logger.trace({ name: element.name, longName, type: 'field', format: element.format, length: element.length }, 'Field');

                const isMu = element.options?.includes('MU') ?? false;

                if (element.level === 1) current = map;

                const opts = isMu
                    ? { name: longName, occ: 10 }
                    : { name: longName };

                current[methodName](element.length, element.name, opts);
            } else {
                switch (element.type) {
                    case 'GR':
                        logger.trace({ name: element.name, longName, type: 'GR' }, 'Group field');
                        current = new AdabasMap();
                        map.group(current, element.name, { name: longName });
                        break;

                    case 'PE':
                        logger.trace({ name: element.name, longName, type: 'PE', occ: 10 }, 'Periodic (PE) field');
                        current = new AdabasMap();
                        map.group(current, element.name, { name: longName, occ: 10 });
                        break;

                    default:
                        break;
                }
            }
        }

        return map;
    }
}