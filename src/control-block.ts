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

import { Int64LE } from 'int64-buffer';

// ---------------------------------------------------------------------------
// Adabas Extended Control Block (ACBX) — wire layout constants
// All offsets are in decimal bytes from the start of the 192-byte buffer.
// Hex equivalents are noted in comments for cross-referencing the Adabas spec.
// ---------------------------------------------------------------------------

const ACBX_LEN   = 192;  // total buffer size

// Field offsets
// const OFFSET_TYP  =   0; // +0x00  acbxtyp   1 byte  — always 0x00
// const OFFSET_RSV1 =   1; // +0x01  acbxrsv1  1 byte  — reserved
const OFFSET_VER  =   2; // +0x02  acbxver   2 bytes — version ('F2')
const OFFSET_LEN  =   4; // +0x04  acbxlen   2 bytes — UInt16LE, always 192
const OFFSET_CMD  =   6; // +0x06  acbxcmd   2 bytes — command code
// const OFFSET_RSV2 =   8; // +0x08  acbxrsv2  2 bytes — reserved, must be 0x00
const OFFSET_RSP  =  10; // +0x0A  acbxrsp   2 bytes — response code
const OFFSET_CID  =  12; // +0x0C  acbxcid   4 bytes — command ID
const OFFSET_DBID =  16; // +0x10  acbxdbid  4 bytes — database ID
const OFFSET_FNR  =  20; // +0x14  acbxfnr   4 bytes — file number
const OFFSET_ISN  =  24; // +0x18  acbxisn   8 bytes — ISN
const OFFSET_ISL  =  32; // +0x20  acbxisl   8 bytes — ISN lower limit
const OFFSET_ISQ  =  40; // +0x28  acbxisq   8 bytes — ISN quantity
const OFFSET_COP1 =  48; // +0x30  acbxcop1  1 byte  — command option 1
const OFFSET_COP2 =  49; // +0x31  acbxcop2  1 byte
const OFFSET_COP3 =  50; // +0x32  acbxcop3  1 byte
const OFFSET_COP4 =  51; // +0x33  acbxcop4  1 byte
const OFFSET_COP5 =  52; // +0x34  acbxcop5  1 byte
const OFFSET_COP6 =  53; // +0x35  acbxcop6  1 byte
const OFFSET_COP7 =  54; // +0x36  acbxcop7  1 byte
const OFFSET_COP8 =  55; // +0x37  acbxcop8  1 byte
const OFFSET_ADD1 =  56; // +0x38  acbxadd1  8 bytes — additions 1
const OFFSET_ADD2 =  64; // +0x40  acbxadd2  4 bytes — additions 2
const OFFSET_ADD3 =  68; // +0x44  acbxadd3  8 bytes — additions 3
const OFFSET_ADD4 =  76; // +0x4C  acbxadd4  8 bytes — additions 4
const OFFSET_ADD5 =  84; // +0x54  acbxadd5  8 bytes — additions 5
const OFFSET_ADD6 =  92; // +0x5C  acbxadd6  8 bytes — additions 6
const OFFSET_RSV3 = 100; // +0x64  acbxrsv3  4 bytes — reserved
const OFFSET_ERRA = 104; // +0x68  acbxerra  8 bytes — error field A
const OFFSET_ERRB = 112; // +0x70  acbxerrb  2 bytes — error field B
const OFFSET_ERRC = 114; // +0x72  acbxerrc  2 bytes — error field C
const OFFSET_ERRD = 116; // +0x74  acbxerrd  1 byte  — error field D
const OFFSET_ERRE = 117; // +0x75  acbxerre  1 byte  — error field E
const OFFSET_ERRF = 118; // +0x76  acbxerrf  2 bytes — error field F
const OFFSET_SUBR = 120; // +0x78  acbxsubr  2 bytes — subroutine
const OFFSET_SUBS = 122; // +0x7A  acbxsubs  2 bytes
const OFFSET_SUBT = 124; // +0x7C  acbxsubt  4 bytes
const OFFSET_LCMP = 128; // +0x80  acbxlcmp  8 bytes — compressed record length
const OFFSET_LDEC = 136; // +0x88  acbxldec  8 bytes — decompressed record length
const OFFSET_CMDT = 144; // +0x90  acbxcmdt  8 bytes — command time
const OFFSET_USER = 152; // +0x98  acbxuser 16 bytes — user info
// +0xA8  acbxsesstime  8 bytes — session time
// +0xB0  acbxrsv4     16 bytes — reserved

// COP field offsets as a lookup array (index 0 = cop1)
const COP_OFFSETS = [
    OFFSET_COP1, OFFSET_COP2, OFFSET_COP3, OFFSET_COP4,
    OFFSET_COP5, OFFSET_COP6, OFFSET_COP7, OFFSET_COP8,
] as const;

// ---------------------------------------------------------------------------
// Init value type — only the writable, meaningful fields
// ---------------------------------------------------------------------------

export type ControlBlockInit = Partial<Pick<ControlBlock,
    | 'cmd' | 'fnr' | 'isn' | 'isl' | 'isq' | 'cid' | 'dbid' | 'rsp'
    | 'cop1' | 'cop2' | 'cop3' | 'cop4' | 'cop5' | 'cop6' | 'cop7' | 'cop8'
    | 'add1' | 'add2' | 'add3' | 'add4' | 'add5' | 'add6'
    | 'user'
>>;

// ---------------------------------------------------------------------------
// ControlBlock
// ---------------------------------------------------------------------------

export class ControlBlock {

    private static readonly ENCODING: BufferEncoding = 'utf8';

    private buffer: Buffer;

    constructor() {
        this.buffer = Buffer.alloc(ACBX_LEN);
        this.init();
    }

    // -----------------------------------------------------------------------
    // Getters / setters — length and command
    // -----------------------------------------------------------------------

    get len(): number { return this.buffer.readUInt16LE(OFFSET_LEN); }
    set len(value: number) { this.buffer.writeUInt16LE(value, OFFSET_LEN); }

    get cmd(): string { return this.readString(OFFSET_CMD, 2); }
    set cmd(value: string) { this.writeString(value, OFFSET_CMD, 2); }

    get rsp(): number { return this.buffer.readUInt16LE(OFFSET_RSP); }
    set rsp(value: number) { this.buffer.writeUInt16LE(value, OFFSET_RSP); }

    get cid(): string { return this.readString(OFFSET_CID, 4); }
    set cid(value: string) { this.writeString(value, OFFSET_CID, 4); }

    get dbid(): number { return this.buffer.readUInt32LE(OFFSET_DBID); }
    set dbid(value: number) { this.buffer.writeUInt32LE(value, OFFSET_DBID); }

    get fnr(): number { return this.buffer.readUInt32LE(OFFSET_FNR); }
    set fnr(value: number) { this.buffer.writeUInt32LE(value, OFFSET_FNR); }

    get isn(): number { return this.readInt64(OFFSET_ISN); }
    set isn(value: number) { this.writeInt64(value, OFFSET_ISN); }

    get isl(): number { return this.readInt64(OFFSET_ISL); }
    set isl(value: number) { this.writeInt64(value, OFFSET_ISL); }

    get isq(): number { return this.readInt64(OFFSET_ISQ); }
    set isq(value: number) { this.writeInt64(value, OFFSET_ISQ); }

    // -----------------------------------------------------------------------
    // Command options — individual named properties delegate to indexed helpers
    // -----------------------------------------------------------------------

    get cop1(): string { return this.getCop(1); }
    set cop1(v: string) { this.setCop(1, v); }

    get cop2(): string { return this.getCop(2); }
    set cop2(v: string) { this.setCop(2, v); }

    get cop3(): string { return this.getCop(3); }
    set cop3(v: string) { this.setCop(3, v); }

    get cop4(): string { return this.getCop(4); }
    set cop4(v: string) { this.setCop(4, v); }

    get cop5(): string { return this.getCop(5); }
    set cop5(v: string) { this.setCop(5, v); }

    get cop6(): string { return this.getCop(6); }
    set cop6(v: string) { this.setCop(6, v); }

    get cop7(): string { return this.getCop(7); }
    set cop7(v: string) { this.setCop(7, v); }

    get cop8(): string { return this.getCop(8); }
    set cop8(v: string) { this.setCop(8, v); }

    // -----------------------------------------------------------------------
    // Additions fields
    // -----------------------------------------------------------------------

    get add1(): string { return this.readString(OFFSET_ADD1, 8); }
    set add1(value: string) { this.writeString(value, OFFSET_ADD1, 8); }

    get add2(): string { return this.readString(OFFSET_ADD2, 4); }
    set add2(value: string) { this.writeString(value, OFFSET_ADD2, 4); }

    get add3(): string { return this.readString(OFFSET_ADD3, 8); }
    set add3(value: string) { this.writeString(value, OFFSET_ADD3, 8); }

    get add4(): string { return this.readString(OFFSET_ADD4, 8); }
    set add4(value: string) { this.writeString(value, OFFSET_ADD4, 8); }

    get add5(): string { return this.readString(OFFSET_ADD5, 8); }
    set add5(value: string) { this.writeString(value, OFFSET_ADD5, 8); }

    get add6(): string { return this.readString(OFFSET_ADD6, 8); }
    set add6(value: string) { this.writeString(value, OFFSET_ADD6, 8); }

    // -----------------------------------------------------------------------
    // Read-only diagnostic fields
    // -----------------------------------------------------------------------

    get rsv3(): string { return this.readString(OFFSET_RSV3,  4); }
    get erra(): string { return this.readString(OFFSET_ERRA,  8); }
    get errb(): string { return this.readString(OFFSET_ERRB,  2); }
    get errc(): string { return this.readString(OFFSET_ERRC,  2); }
    get errd(): string { return this.readString(OFFSET_ERRD,  1); }
    get erre(): string { return this.readString(OFFSET_ERRE,  1); }
    get errf(): string { return this.readString(OFFSET_ERRF,  2); }
    get subr(): string { return this.readString(OFFSET_SUBR,  2); }
    get subs(): string { return this.readString(OFFSET_SUBS,  2); }
    get subt(): string { return this.readString(OFFSET_SUBT,  4); }
    get lcmp(): string { return this.readString(OFFSET_LCMP,  8); }
    get ldec(): string { return this.readString(OFFSET_LDEC,  8); }
    get cmdt(): string { return this.readString(OFFSET_CMDT,  8); }

    get user(): string { return this.readString(OFFSET_USER, 16); }
    set user(value: string) { this.writeString(value, OFFSET_USER, 16); }

    // -----------------------------------------------------------------------
    // Raw buffer access
    // -----------------------------------------------------------------------

    /** Returns the underlying ACBX buffer. */
    get acbx(): Buffer {
        return this.buffer;
    }

    setBuffer(buffer: Buffer): void {
        if (buffer.length < ACBX_LEN) {
            throw new Error(`ACBX buffer must be at least ${ACBX_LEN} bytes, got ${buffer.length}.`);
        }
        this.buffer = buffer;
    }

    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    init(value: ControlBlockInit = {}): void {
        // Zero the entire buffer first.
        this.buffer.fill(0);

        // Fixed protocol header values
        this.buffer.write('F2', OFFSET_VER, 2, ControlBlock.ENCODING);
        this.len = ACBX_LEN;

        // Character fields must be initialised with spaces (0x20), not null bytes.
        // A null byte in a COP field is treated as an active option by the server,
        // which returns RSP 55 (format/conversion error) for unknown option values.
        // ADD1-ADD6 are binary/mixed-use fields and stay zero-initialised.
        this.buffer.fill(0x20, OFFSET_CMD,  OFFSET_CMD  + 2);  // cmd  2 bytes
        this.buffer.fill(0x20, OFFSET_CID,  OFFSET_CID  + 4);  // cid  4 bytes
        this.buffer.fill(0x20, OFFSET_COP1, OFFSET_COP8 + 1);  // cop1-cop8 8 bytes (contiguous)
        this.buffer.fill(0x20, OFFSET_USER, OFFSET_USER + 16); // user 16 bytes

        if (Object.keys(value).length > 0) {
            this.setValue(value);
        }
    }

    // -----------------------------------------------------------------------
    // Diagnostics
    // -----------------------------------------------------------------------

    toString(label: string): string {
        return `${label} Control Block: ${JSON.stringify({
            len:  this.len,  cmd:  this.cmd,  rsp:  this.rsp,
            cid:  this.cid,  dbid: this.dbid, fnr:  this.fnr,
            isn:  this.isn,  isl:  this.isl,  isq:  this.isq,
            cop1: this.cop1, cop2: this.cop2, cop3: this.cop3,
            cop4: this.cop4, cop5: this.cop5, cop6: this.cop6,
            cop7: this.cop7, cop8: this.cop8,
            add1: this.add1, add2: this.add2, add3: this.add3,
            add4: this.add4, add5: this.add5, add6: this.add6,
            rsv3: this.rsv3,
            erra: this.erra, errb: this.errb, errc: this.errc,
            errd: this.errd, erre: this.erre, errf: this.errf,
            subr: this.subr, subs: this.subs, subt: this.subt,
            lcmp: this.lcmp, ldec: this.ldec, cmdt: this.cmdt,
            user: this.user,
        })}`;
    }

    // -----------------------------------------------------------------------
    // Private — COP indexed accessors
    // -----------------------------------------------------------------------

    private getCop(index: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): string {
        const offset = COP_OFFSETS[index - 1];
        return this.readString(offset, 1);
    }

    private setCop(index: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, value: string): void {
        const offset = COP_OFFSETS[index - 1];
        this.writeString(value, offset, 1);
    }

    // -----------------------------------------------------------------------
    // Private — typed setValue
    // -----------------------------------------------------------------------

    private setValue(value: ControlBlockInit): void {
        (Object.keys(value) as (keyof ControlBlockInit)[]).forEach(key => {
            (this[key] as ControlBlock[typeof key]) = value[key];
        });
    }

    // -----------------------------------------------------------------------
    // Private — buffer read/write helpers
    // -----------------------------------------------------------------------

    private readString(offset: number, length: number): string {
        return this.buffer.toString(ControlBlock.ENCODING, offset, offset + length);
    }

    private writeString(value: string, offset: number, length: number): void {
        this.buffer.write(value, offset, length, ControlBlock.ENCODING);
    }

    private readInt64(offset: number): number {
        return new Int64LE(this.buffer, offset).toNumber();
    }

    private writeInt64(value: number, offset: number): void {
        new Int64LE(value).toBuffer().copy(this.buffer, offset, 0, 8);
    }
}