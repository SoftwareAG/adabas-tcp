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

import { Int64LE } from 'int64-buffer';


export class ControlBlock {

    private static readonly LEN             = 192; // overall length of the control buffer
    private static readonly LEN_OFFSET      =   4; // offset of the length field

    private encoding: string | undefined;
    private buffer: Buffer;

    constructor() {
        this.buffer = Buffer.alloc(ControlBlock.LEN);
        this.init();
    }

    get len(): number {
        return this.buffer.readUInt16LE(ControlBlock.LEN_OFFSET);
    }
    set len(value: number) {
        this.buffer.writeUInt16LE(value, ControlBlock.LEN_OFFSET);
    }

    get cmd(): string {
        return this.buffer.toString(this.encoding, 6, 8);
    }
    set cmd(value: string) {
        this.buffer.write(value, 6, 2);
    }

    get rsp(): number {
        return this.buffer.readUInt16LE(10);
    }
    set rsp(value: number) {
        this.buffer.writeUInt16LE(value, 10);
    }

    get cid(): string {
        return this.buffer.toString(this.encoding, 12, 16);
    }
    set cid(value: string) {
        this.buffer.write(value, 12, 4);
    }

    get dbid(): number {
        return this.buffer.readUInt32LE(16);
    }
    set dbid(value: number) {
        this.buffer.writeUInt32LE(value, 16);
    }

    get fnr(): number {
        return this.buffer.readUInt32LE(20);
    }
    set fnr(value: number) {
        this.buffer.writeUInt32LE(value, 20);
    }

    get isn(): number {
        return new Int64LE(this.buffer, 24).toNumber();
    }
    set isn(value: number) {
        new Int64LE(value).toBuffer().copy(this.buffer, 24, 0, 8);
    }

    get isl(): number {
        return new Int64LE(this.buffer, 32).toNumber();
    }
    set isl(value: number) {
        new Int64LE(value).toBuffer().copy(this.buffer, 32, 0, 8);
    }

    get isq(): number {
        return new Int64LE(this.buffer, 40).toNumber();
    }
    set isq(value: number) {
        new Int64LE(value).toBuffer().copy(this.buffer, 40, 0, 8);
    }

    get cop1(): string {
        return this.buffer.toString(this.encoding, 48, 49);
    }
    set cop1(value: string) {
        this.buffer.write(value, 48, 1);
    }

    get cop2(): string {
        return this.buffer.toString(this.encoding, 49, 50);
    }
    set cop2(value: string) {
        this.buffer.write(value, 49, 1);
    }

    get cop3(): string {
        return this.buffer.toString(this.encoding, 50, 51);
    }
    set cop3(value: string) {
        this.buffer.write(value, 50, 1);
    }

    get cop4(): string {
        return this.buffer.toString(this.encoding, 51, 52);
    }
    set cop4(value: string) {
        this.buffer.write(value, 51, 1);
    }

    get cop5(): string {
        return this.buffer.toString(this.encoding, 52, 53);
    }
    set cop5(value: string) {
        this.buffer.write(value, 52, 1);
    }

    get cop6(): string {
        return this.buffer.toString(this.encoding, 53, 54);
    }
    set cop6(value: string) {
        this.buffer.write(value, 53, 1);
    }

    get cop7(): string {
        return this.buffer.toString(this.encoding, 54, 55);
    }
    set cop7(value: string) {
        this.buffer.write(value, 54, 1);
    }

    get cop8(): string {
        return this.buffer.toString(this.encoding, 55, 56);
    }
    set cop8(value: string) {
        this.buffer.write(value, 55, 1);
    }

    get add1(): string {
        return this.buffer.toString(this.encoding, 56, 64);
    }
    set add1(value: string) {
        this.buffer.write(value, 56, 8);
    }

    get add2(): string {
        return this.buffer.toString(this.encoding, 64, 68);
    }
    set add2(value: string) {
        this.buffer.write(value, 64, 4);
    }

    get add3(): string {
        return this.buffer.toString(this.encoding, 68, 76);
    }
    set add3(value: string) {
        this.buffer.write(value, 68, 8);
    }

    get add4(): string {
        return this.buffer.toString(this.encoding, 76, 84);
    }
    set add4(value: string) {
        this.buffer.write(value, 76, 8);
    }

    get add5(): string {
        return this.buffer.toString(this.encoding, 84, 92);
    }
    set add5(value: string) {
        this.buffer.write(value, 84, 8);
    }

    get add6(): string {
        return this.buffer.toString(this.encoding, 92, 100);
    }
    set add6(value: string) {
        this.buffer.write(value, 92, 8);
    }

    get rsv3(): string {
        return this.buffer.toString(this.encoding, 100, 104);
    }

    get erra(): string {
        return this.buffer.toString(this.encoding, 104, 112);
    }

    get errb(): string {
        return this.buffer.toString(this.encoding, 112, 114);
    }

    get errc(): string {
        return this.buffer.toString(this.encoding, 114, 116);
    }

    get errd(): string {
        return this.buffer.toString(this.encoding, 116, 117);
    }

    get erre(): string {
        return this.buffer.toString(this.encoding, 117, 118);
    }

    get errf(): string {
        return this.buffer.toString(this.encoding, 118, 120);
    } 

    get subr(): string {
        return this.buffer.toString(this.encoding, 120, 122);
    }

    get subs(): string {
        return this.buffer.toString(this.encoding, 122, 124);
    }

    get subt(): string {
        return this.buffer.toString(this.encoding, 124, 128);
    }

    get lcmp(): string {
        return this.buffer.toString(this.encoding, 128, 136);
    }

    get ldec(): string {
        return this.buffer.toString(this.encoding, 136, 144);
    }

    get cmdt(): string {
        return this.buffer.toString(this.encoding, 144, 152);
    } 

    get user(): string {
        return this.buffer.toString(this.encoding, 152, 169);
    }
    set user(value: string) {
        this.buffer.write(value, 152, 16);
    }

    get acbx() {
        return this.buffer;
    }

    init(value = {}) {
        this.buffer.writeInt8(0x00, 0);             // acbxtyp       1 byte     +00
        this.buffer.writeInt8(0x00, 1);             // acbxrsv1      1 byte     +01
        this.buffer.write('F2', 2, 2);              // acbxver       1 byte     +02
        this.len = 192;                             // acbxlen       2 byte     +04
        this.cmd = '  ';                            // acbxcmd       2 byte     +06
                                                    // acbxrsv2      2 byte     +08     must be 0x00
        this.rsp = 0;                               // acbxrsp       2 byte     +0A
        this.cid = '    ';                          // acbxcid       4 byte     +0C
        this.dbid = 0;                              // acbxdbid      4 byte     +10
        this.fnr = 0;                               // acbxfnr       4 byte     +14
        this.isn = 0;                               // acbxisn       8 byte     +18
        this.isl = 0;                               // acbxisl       8 byte     +20
        this.isq = 0;                               // acbxisq       8 byte     +28
        this.cop1 = ' ';                            // acbxcop1      1 byte     +30
        this.cop2 = ' ';                            // acbxcop1      1 byte     +31
        this.cop3 = ' ';                            // acbxcop1      1 byte     +32
        this.cop4 = ' ';                            // acbxcop1      1 byte     +33
        this.cop5 = ' ';                            // acbxcop1      1 byte     +34
        this.cop6 = ' ';                            // acbxcop1      1 byte     +35
        this.cop7 = ' ';                            // acbxcop1      1 byte     +36
        this.cop8 = ' ';                            // acbxcop1      1 byte     +37
        this.add1 = '        ';                     // acbxadd1      8 byte     +38
        this.add2 = '    ';                         // acbxadd2      4 byte     +40
        this.add3 = '        ';                     // acbxadd3      8 byte     +44
        this.add4 = '        ';                     // acbxadd4      8 byte     +4C
        this.add5 = '        ';                     // acbxadd5      8 byte     +54
        this.add6 = '        ';                     // acbxadd6      8 byte     +5C
                                                    // acbxrsv3      4 byte     +64
                                                    // acbxerra      8 byte     +68
                                                    // acbxerrb      2 byte     +70
                                                    // acbxerrc      2 byte     +72
                                                    // acbxerrd      1 byte     +74
                                                    // acbxerre      1 byte     +75
                                                    // acbxerrf      2 byte     +76
                                                    // acbxsubr      2 byte     +78
                                                    // acbxsubs      2 byte     +7A
                                                    // acbxsubt      4 byte     +7C
                                                    // acbxlcmp      8 byte     +80
                                                    // acbxldec      8 byte     +88
                                                    // acbxcmdt      8 byte     +90
        this.user = '                ';             // acbxuser     16 byte     +98
                                                    // acbxsesstime  8 byte     +A8
                                                    // acbxrsv4     16 byte     +B0
        if (value) {
            this.setValue(value);
        }
    }

    getFields(): any {
        return this;
    }

    getBuffer(): Buffer {
        return this.buffer;
    }

    setBuffer(buffer: Buffer) {
        this.buffer = buffer;
    }

    toString(text: string): string {
        const data = text + ' Control Block: [' +
              'len: ' + this.len +
            ', cmd: ' + this.cmd +
            ', rsp: ' + this.rsp +
            ', cid: ' + this.cid +
            ', dbid: ' + this.dbid +
            ', fnr: ' + this.fnr  +
            ', isn: ' + this.isn  +
            ', isl: ' + this.isl  +
            ', isq: ' + this.isq  +
            ', cop1: ' + this.cop1 +
            ', cop2: ' + this.cop2 +
            ', cop3: ' + this.cop3 +
            ', cop4: ' + this.cop4 +
            ', cop5: ' + this.cop5 +
            ', cop6: ' + this.cop6 +
            ', cop7: ' + this.cop7 +
            ', cop8: ' + this.cop8 +
            ', add1: ' + this.add1 +
            ', add2: ' + this.add2 +
            ', add3: ' + this.add3 +
            ', add4: ' + this.add4 +
            ', add5: ' + this.add5 +
            ', add6: ' + this.add6 +
            ', rsv3: ' + this.rsv3 +
            ', erra: ' + this.erra +
            ', errb: ' + this.errb +
            ', errc: ' + this.errc +
            ', errd: ' + this.errd +
            ', erre: ' + this.erre +
            ', errf: ' + this.errf +
            ', subr: ' + this.subr +
            ', subs: ' + this.subs +
            ', subt: ' + this.subt +
            ', lcmp: ' + this.lcmp +
            ', ldec: ' + this.ldec +
            ', cmdt: ' + this.cmdt +
            ', user: ' + this.user +
            ']';
        return data;
    }

    setValue(value: any) {
        Object.keys(value).forEach((key) => {
            (this as any)[key] = value[key];
        });
    }
}
