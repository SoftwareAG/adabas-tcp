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

import { AdabasMap } from '../../src/adabas-map';

// ---------------------------------------------------------------------------
// Shared map factories — defined once, reused across encode/decode tests
// ---------------------------------------------------------------------------

function makeAlphaMap()    { return new AdabasMap().alpha(8, 'AA').alpha(4, 'AB'); }
function makeFixedMap()    { return new AdabasMap().fixed(1, 'f1').fixed(2, 'f2').fixed(4, 'f3').fixed(8, 'f4'); }
function makePackedMap()   { return new AdabasMap().packed(5, 'p5'); }
function makeUnpackedMap() { return new AdabasMap().unpacked(10, 'au'); }
function makeFloatMap8()   { return new AdabasMap().float(8, 'af'); }
function makeFloatMap4()   { return new AdabasMap().float(4, 'a4'); }
function makeBinaryMap()   { return new AdabasMap().binary(4, 'ab'); }
function makeMultiMap()    { return new AdabasMap().alpha(4, 'AA', { name: 'alpha', occ: 3 }); }

function makeGroupInnerMap() {
    return new AdabasMap().alpha(1, 'g1').alpha(4, 'g2').alpha(2, 'g3');
}

function makeGroupMap() {
    return new AdabasMap().group(makeGroupInnerMap(), 'GR');
}

function makePeriodicMap() {
    return new AdabasMap().group(makeGroupInnerMap(), 'PE', { occ: 3 });
}

// ---------------------------------------------------------------------------
// Adabas Map Test Suite
// ---------------------------------------------------------------------------

describe('AdabasMap', () => {

    // -----------------------------------------------------------------------
    // Field builder validation
    // -----------------------------------------------------------------------

    describe('field builder validation', () => {

        test('throws exception when short name is not two bytes', () => {
            expect(() => {
                new AdabasMap().alpha(10, 'AA-field');
            }).toThrow('Only two bytes allowed for Short Name.');
        });

        test('throws exception when occurrence is negative for a multiple field', () => {
            expect(() => {
                new AdabasMap().alpha(10, 'AA', { occ: -1 });
            }).toThrow('Occurrence must not be negative.');
        });

        test('throws exception when occurrence is negative for a periodic group', () => {
            expect(() => {
                const data = new AdabasMap().alpha(3, 'AR');
                new AdabasMap().alpha(8, 'AA').group(data, 'AQ', { occ: -1 });
            }).toThrow('Occurrence must not be negative.');
        });
    });

    // -----------------------------------------------------------------------
    // Format buffer (getFb)
    // -----------------------------------------------------------------------

    describe('format buffer (getFb)', () => {

        test('alpha fields produce correct FB and length', () => {
            const map = new AdabasMap().alpha(10, 'AA').alpha(32, 'AB');
            expect(map.getFb()).toBe('AA,10,A,AB,32,A.');
            expect(map.getRbLen()).toBe(42);
        });

        test('unpacked fields produce correct FB and length', () => {
            const map = new AdabasMap().unpacked(4, 'AA').unpacked(8, 'AB');
            expect(map.getFb()).toBe('AA,4,U,AB,8,U.');
            expect(map.getRbLen()).toBe(12);
        });

        test('simple employees fields produce correct FB and length', () => {
            const empl = new AdabasMap()
                .alpha(8, 'AA')
                .alpha(20, 'AC')
                .alpha(20, 'AE')
                .alpha(20, 'AD')
                .alpha(20, 'AJ')
                .alpha(3, 'AL')
                .alpha(3, 'AZ', { occ: 5 });

            expect(empl.getFb()).toBe('AA,8,A,AC,20,A,AE,20,A,AD,20,A,AJ,20,A,AL,3,A,AZC,1,B,AZ1-5,3,A.');
            expect(empl.getRbLen()).toBe(107);
        });

        test('group field produces correct FB and length', () => {
            const name = new AdabasMap().alpha(20, 'AC').alpha(20, 'AE').alpha(20, 'AD');
            const empl = new AdabasMap().alpha(8, 'AA').group(name, 'AB');

            expect(empl.getFb()).toBe('AA,8,A,AC,20,A,AE,20,A,AD,20,A.');
            expect(empl.getRbLen()).toBe(68);
        });

        test('periodic group field produces correct FB and length', () => {
            const income = new AdabasMap()
                .alpha(3, 'AR')
                .alpha(9, 'AS')
                .alpha(9, 'AT', { occ: 5 });

            const empl = new AdabasMap()
                .alpha(8, 'AA')
                .alpha(20, 'AC')
                .alpha(20, 'AE')
                .alpha(20, 'AD')
                .group(income, 'AQ', { occ: 5 });

            expect(empl.getFb()).toBe('AA,8,A,AC,20,A,AE,20,A,AD,20,A,AQC,1,B,AR1-5,3,A,AS1-5,9,A,AT1-5C,1,B,AT1-5(1-5),9,A.');
            expect(empl.getRbLen()).toBe(359);
        });

        test('all supported field types produce correct FB and length', () => {
            const periodic = new AdabasMap()
                .alpha(3, 'P1')
                .packed(9, 'PP')
                .unpacked(9, 'PU', { occ: 5 });

            const group = new AdabasMap()
                .alpha(3, 'GA')
                .packed(9, 'GP')
                .unpacked(9, 'GU', { occ: 5 });

            const types = new AdabasMap()
                .alpha(8, 'AL')
                .binary(20, 'BI')
                .fixed(4, 'FI')
                .float(8, 'FL')
                .packed(4, 'PA')
                .unpacked(4, 'UN')
                .group(group, 'GR')
                .group(periodic, 'PE', { occ: 5 });

            expect(types.getFb()).toBe('AL,8,A,BI,20,B,FI,4,F,FL,8,G,PA,4,P,UN,4,U,GA,3,A,GP,9,P,GUC,1,B,GU1-5,9,U,PEC,1,B,P11-5,3,A,PP1-5,9,P,PU1-5C,1,B,PU1-5(1-5),9,U.');
            expect(types.getRbLen()).toBe(397);
        });
    });

    // -----------------------------------------------------------------------
    // Validation (validate)
    // -----------------------------------------------------------------------

    describe('validate', () => {

        test('throws when an alpha field receives a non-string value', () => {
            const map = new AdabasMap().alpha(10, 'AA', { name: 'alpha' });
            expect(() => map.validate({ alpha: 123 })).toThrow(/"alpha" must be a string/);
        });

        test('throws when a fixed field receives a non-number value', () => {
            const map = new AdabasMap().fixed(8, 'AA', { name: 'fixed' });
            expect(() => map.validate({ fixed: 'abc' })).toThrow(/"fixed" must be a number/);
        });

        test('throws when a packed field receives a non-number value', () => {
            const map = new AdabasMap().packed(10, 'AA', { name: 'packed' });
            expect(() => map.validate({ packed: 'abc' })).toThrow(/"packed" must be a number/);
        });

        test('throws when an unpacked field receives a non-number value', () => {
            const map = new AdabasMap().unpacked(10, 'AA', { name: 'unpacked' });
            expect(() => map.validate({ unpacked: 'abc' })).toThrow(/"unpacked" must be a number/);
        });

        test('throws when a float field receives a non-number value', () => {
            const map = new AdabasMap().float(8, 'AA', { name: 'float' });
            expect(() => map.validate({ float: 'abc' })).toThrow(/"float" must be a number/);
        });

        test('throws when a group field receives a non-object value', () => {
            const inner = new AdabasMap().alpha(10, 'AA', { name: 'alpha' });
            const map   = new AdabasMap().group(inner, 'GR', { name: 'group' });
            expect(() => map.validate({ group: 'abc' })).toThrow(/"group" must be of type object/);
        });

        test('throws when a multiple field receives a non-array value', () => {
            const map = new AdabasMap().alpha(10, 'AA', { name: 'alpha', occ: 10 });
            expect(() => map.validate({ alpha: 'abc' })).toThrow(/"alpha" must be an array/);
        });

        test('throws when a periodic group receives a non-array value', () => {
            const inner = new AdabasMap().alpha(10, 'AA', { name: 'alpha' });
            const map   = new AdabasMap().group(inner, 'GR', { name: 'group', occ: 10 });
            expect(() => map.validate({ group: 'abc' })).toThrow(/"group" must be an array/);
        });

        test('throws when multiple field exceeds max occurrence count', () => {
            const map = new AdabasMap().alpha(10, 'AA', { name: 'alpha', occ: 2 });
            expect(() => map.validate({ alpha: ['a', 'b', 'c'] }))
                .toThrow(/"alpha" must contain less than or equal to 2 items/);
        });

        test('throws when periodic group exceeds max occurrence count', () => {
            const inner = new AdabasMap().alpha(10, 'AA', { name: 'alpha' });
            const map   = new AdabasMap().group(inner, 'GR', { name: 'group', occ: 2 });
            expect(() => map.validate({ group: [{ alpha: 'a' }, { alpha: 'b' }, { alpha: 'c' }] }))
                .toThrow(/"group" must contain less than or equal to 2 items/);
        });
    });

    // -----------------------------------------------------------------------
    // Record buffer encoding (getRb)
    // -----------------------------------------------------------------------

    describe('record buffer encoding (getRb)', () => {

        test('alpha fields encode correctly', () => {
            expect(makeAlphaMap().getRb({ AB: 'ABCD', AA: 'AA', ZZ: 12 })).toEqual(
                Buffer.from([0x41, 0x41, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x41, 0x42, 0x43, 0x44])
            );
        });

        test('alpha field: unknown key in object is silently ignored', () => {
            const map = makeAlphaMap();
            expect(() => map.getRb({ AA: 'Hello', UNKNOWN: 'ignored' })).not.toThrow();
        });

        test('alpha field: empty string pads with spaces', () => {
            const map = new AdabasMap().alpha(4, 'AA');
            expect(map.getRb({ AA: '' })).toEqual(Buffer.from('    '));
        });

        test('fixed fields encode correctly (positive values)', () => {
            expect(makeFixedMap().getRb({ f1: 18, f2: 12345, f3: 12345678, f4: 123456789 })).toEqual(
                Buffer.from([18, 57, 48, 78, 97, 188, 0, 21, 205, 91, 7, 0, 0, 0, 0])
            );
        });

        test('fixed fields encode correctly (negative values)', () => {
            expect(makeFixedMap().getRb({ f1: -18, f2: -12345, f3: -12345678, f4: -123456789 })).toEqual(
                Buffer.from([238, 199, 207, 178, 158, 67, 255, 235, 50, 164, 248, 255, 255, 255, 255])
            );
        });

        test('fixed field: zero encodes correctly', () => {
            const map = new AdabasMap().fixed(4, 'AA');
            expect(map.getRb({ AA: 0 })).toEqual(Buffer.alloc(4));
        });

        test('packed field encodes correctly (positive)', () => {
            expect(makePackedMap().getRb({ p5: 79743 })).toEqual(
                Buffer.from([0, 0, 121, 116, 60])
            );
        });

        test('packed field encodes correctly (negative)', () => {
            expect(makePackedMap().getRb({ p5: -79743 })).toEqual(
                Buffer.from([0, 0, 121, 116, 59])
            );
        });

        test('packed field with precision encodes correctly (positive)', () => {
            const map = new AdabasMap().packed(5, 'p5', { prec: 2 });
            expect(map.getRb({ p5: 12.34 })).toEqual(Buffer.from([0, 0, 0x01, 0x23, 0x4c]));
        });

        test('packed field with precision encodes correctly (negative)', () => {
            const map = new AdabasMap().packed(5, 'p5', { prec: 2 });
            expect(map.getRb({ p5: -12.34 })).toEqual(Buffer.from([0, 0, 0x01, 0x23, 0x4b]));
        });

        test('unpacked field encodes correctly (positive)', () => {
            expect(makeUnpackedMap().getRb({ au: 987654321 })).toEqual(Buffer.from('0987654321'));
        });

        test('unpacked field encodes correctly (negative)', () => {
            expect(makeUnpackedMap().getRb({ au: -987654321 })).toEqual(Buffer.from('-987654321'));
        });

        test('float (8-byte) field encodes correctly', () => {
            expect(makeFloatMap8().getRb({ af: 9876.54321 })).toEqual(
                Buffer.from([0x6e, 0xc0, 0xe7, 0x87, 0x45, 0x4a, 0xc3, 0x40])
            );
        });

        test('float (4-byte) field encodes correctly', () => {
            expect(makeFloatMap4().getRb({ a4: 9876.5 })).toEqual(
                Buffer.from([0x00, 0x52, 0x1a, 0x46])
            );
        });

        test('binary field encodes correctly', () => {
            const ab = Buffer.from([0x19, 0xab, 0x36, 0x1f]);
            expect(makeBinaryMap().getRb({ ab })).toEqual(ab);
        });

        test('multiple field encodes correctly', () => {
            expect(makeMultiMap().getRb({ alpha: ['aaaa', 'b', 'cc'] })).toEqual(
                Buffer.from([0x61, 0x61, 0x61, 0x61, 0x62, 0x20, 0x20, 0x20, 0x63, 0x63, 0x20, 0x20])
            );
        });

        test('group field encodes correctly', () => {
            expect(makeGroupMap().getRb({ GR: { g2: 'aaaa', g1: 'b', g3: 'cc' } })).toEqual(
                Buffer.from('baaaacc')
            );
        });

        test('periodic group encodes correctly', () => {
            const pe = [
                { g1: 'b', g2: 'aaaa', g3: 'cc' },
                { g1: 'e', g2: 'dddd', g3: 'ff' },
                { g1: 'h', g2: 'gggg', g3: 'ii' },
            ];
            expect(makePeriodicMap().getRb({ PE: pe })).toEqual(Buffer.from('behaaaaddddggggccffii'));
        });
    });

    // -----------------------------------------------------------------------
    // Object extraction (getObject)
    // -----------------------------------------------------------------------

    describe('object extraction (getObject)', () => {

        test('alpha fields decode correctly', () => {
            const obj = makeAlphaMap().getObject(
                Buffer.from([0x41, 0x41, 0, 0, 0, 0, 0, 0, 0x41, 0x42, 0x43, 0x44]), false
            );
            expect(obj).toMatchObject({ AA: 'AA', AB: 'ABCD' });
        });

        test('fixed fields decode correctly (positive values)', () => {
            const obj = makeFixedMap().getObject(
                Buffer.from([18, 57, 48, 78, 97, 188, 0, 21, 205, 91, 7, 0, 0, 0, 0]), false
            );
            expect(obj).toMatchObject({ f1: 18, f2: 12345, f3: 12345678, f4: 123456789 });
        });

        test('fixed fields decode correctly (negative values)', () => {
            const obj = makeFixedMap().getObject(
                Buffer.from([238, 199, 207, 178, 158, 67, 255, 235, 50, 164, 248, 255, 255, 255, 255]), false
            );
            expect(obj).toMatchObject({ f1: -18, f2: -12345, f3: -12345678, f4: -123456789 });
        });

        test('packed field decodes correctly (positive)', () => {
            const obj = makePackedMap().getObject(Buffer.from([0, 0, 121, 116, 60]), false);
            expect(obj).toMatchObject({ p5: 79743 });
        });

        test('packed field decodes correctly (negative)', () => {
            const obj = makePackedMap().getObject(Buffer.from([0, 0, 121, 116, 59]), false);
            expect(obj).toMatchObject({ p5: -79743 });
        });

        test('unpacked field decodes correctly (positive)', () => {
            const obj = makeUnpackedMap().getObject(
                Buffer.from([57, 56, 55, 54, 53, 52, 51, 50, 49, 0]), false
            );
            expect(obj).toMatchObject({ au: 987654321 });
        });

        test('unpacked field decodes correctly (negative)', () => {
            const obj = makeUnpackedMap().getObject(
                Buffer.from([0x2d, 57, 56, 55, 54, 53, 52, 51, 50, 49]), false
            );
            expect(obj).toMatchObject({ au: -987654321 });
        });

        test('float (8-byte) field decodes correctly', () => {
            const obj = makeFloatMap8().getObject(
                Buffer.from([0x6e, 0xc0, 0xe7, 0x87, 0x45, 0x4a, 0xc3, 0x40]), false
            );
            expect(obj).toMatchObject({ af: 9876.54321 });
        });

        test('float (4-byte) field decodes correctly', () => {
            const obj = makeFloatMap4().getObject(Buffer.from([0x00, 0x52, 0x1a, 0x46]), false);
            expect(obj).toMatchObject({ a4: 9876.5 });
        });

        test('binary field decodes correctly', () => {
            const ab  = Buffer.from([0x19, 0xab, 0x36, 0x1f]);
            const obj = makeBinaryMap().getObject(ab);
            expect(obj).toMatchObject({ ab });
        });

        test('multiple field decodes correctly', () => {
            const obj = makeMultiMap().getObject(
                Buffer.from([0x61, 0x61, 0x61, 0x61, 0x62, 0x00, 0x00, 0x00, 0x63, 0x63, 0x00, 0x00]), false
            );
            expect(obj).toMatchObject({ alpha: ['aaaa', 'b', 'cc'] });
        });

        test('group field decodes correctly', () => {
            const obj = makeGroupMap().getObject(Buffer.from('baaaacc'), false);
            expect(obj).toMatchObject({ GR: { g1: 'b', g2: 'aaaa', g3: 'cc' } });
        });

        test('periodic group decodes correctly', () => {
            const obj = makePeriodicMap().getObject(Buffer.from('behaaaaddddggggccffii'), false);
            expect(obj).toMatchObject({
                PE: [
                    { g1: 'b', g2: 'aaaa', g3: 'cc' },
                    { g1: 'e', g2: 'dddd', g3: 'ff' },
                    { g1: 'h', g2: 'gggg', g3: 'ii' },
                ],
            });
        });
    });

    // -----------------------------------------------------------------------
    // Round-trip tests (getRb → getObject)
    // -----------------------------------------------------------------------

    describe('round-trip encoding/decoding', () => {

        test('alpha fields round-trip correctly', () => {
            const input = { AA: 'Hello123', AB: 'ABCD' };
            expect(makeAlphaMap().getObject(makeAlphaMap().getRb(input), false)).toMatchObject(input);
        });

        test('fixed fields round-trip correctly', () => {
            const input = { f1: 18, f2: 12345, f3: 12345678, f4: 123456789 };
            expect(makeFixedMap().getObject(makeFixedMap().getRb(input), false)).toMatchObject(input);
        });

        test('packed field round-trips correctly', () => {
            const input = { p5: 79743 };
            expect(makePackedMap().getObject(makePackedMap().getRb(input), false)).toMatchObject(input);
        });

        test('unpacked field round-trips correctly', () => {
            const input = { au: 987654321 };
            expect(makeUnpackedMap().getObject(makeUnpackedMap().getRb(input), false)).toMatchObject(input);
        });

        test('float (8-byte) field round-trips correctly', () => {
            const input = { af: 9876.54321 };
            expect(makeFloatMap8().getObject(makeFloatMap8().getRb(input), false)).toMatchObject(input);
        });

        test('group field round-trips correctly', () => {
            const input = { GR: { g1: 'b', g2: 'aaaa', g3: 'cc' } };
            expect(makeGroupMap().getObject(makeGroupMap().getRb(input), false)).toMatchObject(input);
        });

        test('periodic group round-trips correctly', () => {
            const input = {
                PE: [
                    { g1: 'b', g2: 'aaaa', g3: 'cc' },
                    { g1: 'e', g2: 'dddd', g3: 'ff' },
                    { g1: 'h', g2: 'gggg', g3: 'ii' },
                ],
            };
            expect(makePeriodicMap().getObject(makePeriodicMap().getRb(input), false)).toMatchObject(input);
        });
    });

    // -----------------------------------------------------------------------
    // Code generation (toJs)
    // -----------------------------------------------------------------------

    describe('toJs', () => {

        test('generates correct JavaScript map definition', () => {
            const periodic = new AdabasMap()
                .alpha(3, 'P1')
                .packed(9, 'PP')
                .unpacked(9, 'PU', { occ: 5 });

            const group = new AdabasMap()
                .alpha(3, 'GA')
                .packed(9, 'GP')
                .unpacked(9, 'GU', { occ: 5 });

            const types = new AdabasMap()
                .alpha(8, 'AL')
                .binary(20, 'BI')
                .fixed(4, 'FI')
                .float(8, 'FL')
                .packed(4, 'PA')
                .unpacked(4, 'UN')
                .group(group, 'GR')
                .group(periodic, 'PE', { occ: 5 });

            expect(types.toJs()).toMatchSnapshot();
        });
    });
});