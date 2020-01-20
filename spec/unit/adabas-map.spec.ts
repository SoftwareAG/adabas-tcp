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

import { AdabasMap } from '../../src/adabas-map';

describe('Adabas Map Test Suite', () => {

    test('expect exeception when short name not two bytes', () => {
        expect(() => {
            new AdabasMap().alpha(10, 'AA-field');
        }).toThrowError('Only two byte for Short Name valid.');
    });

    test('expect exeception when occurrence is negative for a multiple field', () => {
        expect(() => {
            new AdabasMap().alpha(10, 'AA', { occ: -1 });
        }).toThrowError('Occurrence must not be negative.');
    });

    test('expect exeception when occurrence is negative for a periodic group', () => {
        expect(() => {
            const data = new AdabasMap()
                .alpha(3, 'AR')
                ;
            new AdabasMap()
                .alpha(8, 'AA')
                .group(data, 'AQ', { occ: -1 })
                ;
        }).toThrowError('Occurrence must not be negative.');
    });

    test('expect that the buffer and the length is correct for a alpha fields', () => {
        const alpha = new AdabasMap()
            .alpha(10, 'AA')
            .alpha(32, 'AB');
        expect(alpha.getFb()).toBe('AA,10,A,AB,32,A.');
        expect(alpha.getRbLen()).toBe(42);
    });

    test('expect that the buffer and the length is correct for a unpacked fields', () => {
        const alpha = new AdabasMap()
            .unpacked(4, 'AA')
            .unpacked(8, 'AB');
        expect(alpha.getFb()).toBe('AA,4,U,AB,8,U.');
        expect(alpha.getRbLen()).toBe(12);
    });

    test('expect that the buffer and the length is correct for a simple employees fields', () => {
        // instanciate a new AdabasMap object
        const empl = new AdabasMap();

        // define a map for the data access
        empl
            .alpha(8, 'AA')
            .alpha(20, 'AC')
            .alpha(20, 'AE')
            .alpha(20, 'AD')
            .alpha(20, 'AJ')
            .alpha(3, 'AL')
            .alpha(3, 'AZ', { occ: 5 }) // multiple field
            ;

        expect(empl.getFb()).toBe('AA,8,A,AC,20,A,AE,20,A,AD,20,A,AJ,20,A,AL,3,A,AZC,1,B,AZ1-5,3,A.');
        expect(empl.getRbLen()).toBe(107);
    });

    test('expect that the buffer and the length is correct for a employees group', () => {
        // instanciate a new AdabasMap objects
        const name = new AdabasMap();
        const empl = new AdabasMap();

        // define maps for the data access
        name
            .alpha(20, 'AC')
            .alpha(20, 'AE')
            .alpha(20, 'AD')
            ;
        empl
            .alpha(8, 'AA')
            .group(name, 'AB')
            ;

        expect(empl.getFb()).toBe('AA,8,A,AC,20,A,AE,20,A,AD,20,A.');
        expect(empl.getRbLen()).toBe(68);
    });


    test('expect that the buffer and the length is correct for a employees periodic group', () => {
        // instanciate a new AdabasMap objects
        const income = new AdabasMap();
        const empl = new AdabasMap();

        // define maps for the data access
        income
            .alpha(3, 'AR')
            .alpha(9, 'AS')
            .alpha(9, 'AT', { occ: 5 }) // multiple field
            ;
        empl
            .alpha(8, 'AA')
            .alpha(20, 'AC')
            .alpha(20, 'AE')
            .alpha(20, 'AD')
            .group(income, 'AQ', { occ: 5 })
            ;

        expect(empl.getFb()).toBe('AA,8,A,AC,20,A,AE,20,A,AD,20,A,AQC,1,B,AR1-5,3,A,AS1-5,9,A,AT1-5C,1,B,AT1-5(1-5),9,A.');
        expect(empl.getRbLen()).toBe(359);
    });

    test('expect that the buffer and the length is correct for all supported types', () => {
        // instanciate a new AdabasMap objects
        const periodic = new AdabasMap();
        const group = new AdabasMap();
        const types = new AdabasMap();

        // define maps for the data access
        periodic
            .alpha(3, 'P1')
            .packed(9, 'PP')
            .unpacked(9, 'PU', { occ: 5 }) // multiple field
            ;
        group
            .alpha(3, 'GA')
            .packed(9, 'GP')
            .unpacked(9, 'GU', { occ: 5 }) // multiple field
            ;
        types
            .alpha(8, 'AL')
            .binary(20, 'BI')
            .fixed(4, 'FI')
            .float(8, 'FL')
            .packed(4, 'PA')
            .unpacked(4, 'UN')
            .group(group, 'GR')
            .group(periodic, 'PE', { occ: 5 })
            ;

        expect(types.getFb()).toBe('AL,8,A,BI,20,B,FI,4,F,FL,8,G,PA,4,P,UN,4,U,GA,3,A,GP,9,P,GUC,1,B,GU1-5,9,U,PEC,1,B,P11-5,3,A,PP1-5,9,P,PU1-5C,1,B,PU1-5(1-5),9,U.');
        expect(types.getRbLen()).toBe(397);
    });

    test('expect that an validation error when wrong format an alpha field is set', () => {
        const alpha = new AdabasMap().alpha(10, 'AA', { name: 'alpha' });
        expect(() => {
            alpha.validate({ alpha: 123 });
        }).toThrowError('child "alpha" fails because ["alpha" must be a string]');
    });

    test('expect that an validation error when wrong format an fixed field is set', () => {
        const fixed = new AdabasMap().fixed(8, 'AA', { name: 'fixed' });
        expect(() => {
            fixed.validate({ fixed: 'abc' });
        }).toThrowError('child "fixed" fails because ["fixed" must be a number]');
    });

    test('expect that an validation error when wrong format an packed field is set', () => {
        const packed = new AdabasMap().packed(10, 'AA', { name: 'packed' });
        expect(() => {
            packed.validate({ packed: 'abc' });
        }).toThrowError('child "packed" fails because ["packed" must be a number]');
    });

    test('expect that an validation error when wrong format an unpacked field is set', () => {
        const unpacked = new AdabasMap().unpacked(10, 'AA', { name: 'unpacked' });
        expect(() => {
            unpacked.validate({ unpacked: 'abc' });
        }).toThrowError('child "unpacked" fails because ["unpacked" must be a number]');
    });

    test('expect that an validation error when wrong format an float field is set', () => {
        const float = new AdabasMap().float(8, 'AA', { name: 'float' });
        expect(() => {
            float.validate({ float: 'abc' });
        }).toThrowError('child "float" fails because ["float" must be a number]');
    });

    test('expect that an validation error when a group is not an object', () => {
        const group = new AdabasMap().alpha(10, 'AA', { name: 'alpha' });
        const map = new AdabasMap().group(group, 'GR', { name: 'group' });
        expect(() => {
            map.validate({ group: 'abc' });
        }).toThrowError('child "group" fails because ["group" must be an object]');
    });

    test('expect that an validation error when a multiple field is not an array', () => {
        const multi = new AdabasMap().alpha(10, 'AA', { name: 'alpha', occ: 10 });
        expect(() => {
            multi.validate({ alpha: 'abc' });
        }).toThrowError('child "alpha" fails because ["alpha" must be an array]');
    });

    test('expect that an validation error when a periodic is not an array', () => {
        const group = new AdabasMap().alpha(10, 'AA', { name: 'alpha' });
        const map = new AdabasMap().group(group, 'GR', { name: 'group', occ: 10 });
        expect(() => {
            map.validate({ group: 'abc' });
        }).toThrowError('child "group" fails because ["group" must be an array]');
    });

    test('expect that an validation error when more than max occ of a multiple field is provided', () => {
        const multi = new AdabasMap().alpha(10, 'AA', { name: 'alpha', occ: 2 });
        expect(() => {
            multi.validate({ alpha: ['a', 'b', 'c'] });
        }).toThrowError('child "alpha" fails because ["alpha" must contain less than or equal to 2 items]');
    });

    test('expect that an validation error when more than max occ of a periodic field is provided', () => {
        const group = new AdabasMap().alpha(10, 'AA', { name: 'alpha' });
        const map = new AdabasMap().group(group, 'GR', { name: 'group', occ: 2 });
        expect(() => {
            map.validate({ group: [{ alpha: 'a' }, { alpha: 'b' }, { alpha: 'c' }] });
        }).toThrowError('child "group" fails because ["group" must contain less than or equal to 2 items]');
    });

    test('expect that the toJavascript method works correctly', () => {
        // instanciate a new AdabasMap objects
        const periodic = new AdabasMap();
        const group = new AdabasMap();
        const types = new AdabasMap();

        // define maps for the data access
        periodic
            .alpha(3, 'P1')
            .packed(9, 'PP')
            .unpacked(9, 'PU', { occ: 5 }) // multiple field
            ;
        group
            .alpha(3, 'GA')
            .packed(9, 'GP')
            .unpacked(9, 'GU', { occ: 5 }) // multiple field
            ;
        types
            .alpha(8, 'AL')
            .binary(20, 'BI')
            .fixed(4, 'FI')
            .float(8, 'FL')
            .packed(4, 'PA')
            .unpacked(4, 'UN')
            .group(group, 'GR')
            .group(periodic, 'PE', { occ: 5 })
            ;

        expect(types.toJs()).toBe('const GR = new AdabasMap()\n\t.alpha(3, \'GA\')\n\t.packed(9, \'GP\')\n\t.unpacked(9, \'GU\', { occ: 5 })\n\;\nconst PE = new AdabasMap()\n\t.alpha(3, \'P1\')\n\t.packed(9, \'PP\')\n\t.unpacked(9, \'PU\', { occ: 5 })\n;\nconst Map = new AdabasMap()\n\t.alpha(8, \'AL\')\n\t.binary(20, \'BI\')\n\t.fixed(4, \'FI\')\n\t.float(8, \'FL\')\n\t.packed(4, \'PA\')\n\t.unpacked(4, \'UN\')\n\t.group(GR, \'GR\')\n\t.group(PE, \'PE\', { occ: 5 })\n;\n');
    });

    test('expect that an alpha rb is correctly generated', () => {
        const aMap = new AdabasMap()
            .alpha(8, 'AA')
            .alpha(4, 'AB')
            ;

        expect(aMap.getRb({ AB: 'ABCD', AA: 'AA', ZZ: 12 }).equals(Buffer.from([0x41, 0x41, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x41, 0x42, 0x43, 0x44]))).toBeTruthy();
    });

    test('expect that a fixed rb is correctly generated', () => {
        const fMap = new AdabasMap()
            .fixed(1, 'f1')
            .fixed(2, 'f2')
            .fixed(4, 'f3')
            .fixed(8, 'f4')
            ;

        const f1 = 18;
        const f2 = 12345;
        const f3 = 12345678;
        const f4 = 123456789;
        expect(fMap.getRb({ f1, f2, f3, f4 }).equals(Buffer.from([18, 57, 48, 78, 97, 188, 0, 21, 205, 91, 7, 0, 0, 0, 0]))).toBeTruthy();
        expect(fMap.getRb({ f1: -f1, f2: -f2, f3: -f3, f4: -f4 }).equals(Buffer.from([238, 199, 207, 178, 158, 67, 255, 235, 50, 164, 248, 255, 255, 255, 255]))).toBeTruthy();
    });

    test('expect that a packed rb is correctly generated', () => {
        const pMap = new AdabasMap()
            .packed(5, 'p5')
            ;
        const p5 = 79743;
        expect(pMap.getRb({ p5 }).equals(Buffer.from([0, 0, 121, 116, 60]))).toBeTruthy();
        expect(pMap.getRb({ p5: -p5 }).equals(Buffer.from([0, 0, 121, 116, 59]))).toBeTruthy();
    });

    test('expect that a packed rb with precision is correctly generated', () => {
        const pMap = new AdabasMap()
            .packed(5, 'p5', { prec: 2 })
            ;
        const p5 = 12.34;
        expect(pMap.getRb({ p5 }).equals(Buffer.from([0, 0, 0x01, 0x23, 0x4c]))).toBeTruthy();
        expect(pMap.getRb({ p5: -p5 }).equals(Buffer.from([0, 0, 0x01, 0x23, 0x4b]))).toBeTruthy();
    });

    test('expect that a unpacked rb is correctly generated', () => {
        const uMap = new AdabasMap()
            .unpacked(10, 'au');
        const au = 987654321;
        expect(uMap.getRb({ au }).equals(Buffer.from('0987654321'))).toBeTruthy();
        expect(uMap.getRb({ au: -au }).equals(Buffer.from('-987654321'))).toBeTruthy();
    });

    test('expect that a float rb is correctly generated', () => {
        const gMap = new AdabasMap()
            .float(8, 'af');
        const af = 9876.54321;
        expect(gMap.getRb({ af }).equals(Buffer.from([0x6e, 0xc0, 0xe7, 0x87, 0x45, 0x4a, 0xc3, 0x40]))).toBeTruthy();

        const gMap4 = new AdabasMap()
            .float(4, 'a4');
        const a4 = 9876.5;
        expect(gMap4.getRb({ a4 }).equals(Buffer.from([0x00, 0x52, 0x1a, 0x46]))).toBeTruthy();

    });

    test('expect that a binary rb is correctly generated', () => {
        const bMap = new AdabasMap()
            .binary(4, 'ab')
            ;
        const ab = Buffer.from([0x19, 0xab, 0x36, 0x1f]);
        expect(bMap.getRb({ ab }).equals(Buffer.from([0x19, 0xab, 0x36, 0x1f]))).toBeTruthy();
    });

    test('expect that for a multiple field the rb is correctly generated', () => {
        const multi = new AdabasMap()
            .alpha(4, 'AA', { name: 'alpha', occ: 3 });

        const alpha = ['aaaa', 'b', 'cc'];

        expect(multi.getRb({ alpha }).equals(Buffer.from([0x61, 0x61, 0x61, 0x61, 0x62, 0x20, 0x20, 0x20, 0x63, 0x63, 0x20, 0x20]))).toBeTruthy();
    });

    test('expect that for a group the rb is correctly generated', () => {
        const alphaMap = new AdabasMap()
            .alpha(1, 'g1')
            .alpha(4, 'g2')
            .alpha(2, 'g3')
            ;
        const groupMap = new AdabasMap()
            .group(alphaMap, 'GR')
            ;
        const alpha = { g2: 'aaaa', g1: 'b', g3: 'cc' };
        expect(groupMap.getRb({ GR: alpha }).equals(Buffer.from('baaaacc'))).toBeTruthy();
    });

    test('expect that for the periodic group the rb is correctly generated', () => {
        const alphaMap = new AdabasMap()
            .alpha(1, 'g1')
            .alpha(4, 'g2')
            .alpha(2, 'g3')
            ;
        const groupMap = new AdabasMap()
            .group(alphaMap, 'PE', { occ: 3 })
            ;
            
        const alpha = [{ g2: 'aaaa', g1: 'b', g3: 'cc' }, { g2: 'dddd', g1: 'e', g3: 'ff' }, { g2: 'gggg', g1: 'h', g3: 'ii' }];
        expect(groupMap.getRb({ PE: alpha }).equals(Buffer.from('behaaaaddddggggccffii'))).toBeTruthy();
    });

    test('expect that the object with alpha fields is correctly created from the buffer', () => {
        const aMap = new AdabasMap()
            .alpha(8, 'AA')
            .alpha(4, 'AB')
            ;
        const obj: any = aMap.getObject(Buffer.from([0x41, 0x41, 0, 0, 0, 0, 0, 0, 0x41, 0x42, 0x43, 0x44]), false);

        expect(obj).toMatchObject({ AA: 'AA', AB: 'ABCD' });
    });

    test('expect that the object with fixed fields is correctly created from the buffer', () => {
        const fMap = new AdabasMap()
            .fixed(1, 'f1')
            .fixed(2, 'f2')
            .fixed(4, 'f3')
            .fixed(8, 'f4')
            ;

        const f1 = 18;
        const f2 = 12345;
        const f3 = 12345678;
        const f4 = 123456789;

        const obj1 = fMap.getObject((Buffer.from([18, 57, 48, 78, 97, 188, 0, 21, 205, 91, 7, 0, 0, 0, 0])), false);
        expect(obj1).toMatchObject({ f1, f2, f3, f4 });

        const obj2 = fMap.getObject((Buffer.from([238, 199, 207, 178, 158, 67, 255, 235, 50, 164, 248, 255, 255, 255, 255])), false);
        expect(obj2).toMatchObject({ f1: -f1, f2: -f2, f3: -f3, f4: -f4 });
    });

    test('expect that the object with a packed field is correctly created from the buffer', () => {
        const pMap = new AdabasMap()
            .packed(5, 'p5')
            ;
        const p5 = 79743;

        const obj1 = pMap.getObject((Buffer.from([0, 0, 121, 116, 60])), false);
        expect(obj1).toMatchObject({ p5 });

        const obj2 = pMap.getObject((Buffer.from([0, 0, 121, 116, 59])), false);
        expect(obj2).toMatchObject({ p5: -p5 });
    });

    test('expect that the object with a unpacked field is correctly created from the buffer', () => {
        const uMap = new AdabasMap()
            .unpacked(10, 'au');
        const au = 987654321;

        const obj1 = uMap.getObject((Buffer.from([57, 56, 55, 54, 53, 52, 51, 50, 49, 0])), false);
        expect(obj1).toMatchObject({ au });

        const obj2 = uMap.getObject((Buffer.from([0x2d, 57, 56, 55, 54, 53, 52, 51, 50, 49])), false);
        expect(obj2).toMatchObject({ au: -au });
    });

    test('expect that the object with a float field is correctly created from the buffer', () => {
        const gMap = new AdabasMap()
            .float(8, 'af');
        const af = 9876.54321;

        const obj1 = gMap.getObject((Buffer.from([0x6e, 0xc0, 0xe7, 0x87, 0x45, 0x4a, 0xc3, 0x40])), false);
        expect(obj1).toMatchObject({ af });

        const gMap4 = new AdabasMap()
            .float(4, 'a4');
        const a4 = 9876.5;

        const obj2 = gMap4.getObject((Buffer.from([0x00, 0x52, 0x1a, 0x46])), false);
        expect(obj2).toMatchObject({ a4 });
    });

    test('expect that the object with a binary field is correctly created from the buffer', () => {
        const bMap = new AdabasMap()
            .binary(4, 'ab')
            ;

        const ab = Buffer.from([0x19, 0xab, 0x36, 0x1f]);

        const obj = bMap.getObject(ab);
        expect(obj).toMatchObject({ ab });
    });

    test('expect that the object with a multiple field is correctly created from the buffer', () => {
        const multi = new AdabasMap()
            .alpha(4, 'AA', { name: 'alpha', occ: 3 });

        const alpha = ['aaaa', 'b', 'cc'];

        const obj = multi.getObject(Buffer.from([0x61, 0x61, 0x61, 0x61, 0x62, 0x00, 0x00, 0x00, 0x63, 0x63, 0x00, 0x00]), false);
        expect(obj).toMatchObject({ alpha });
    });

    test('expect that the object with a group field is correctly created from the buffer', () => {
        const alphaMap = new AdabasMap()
            .alpha(1, 'g1')
            .alpha(4, 'g2')
            .alpha(2, 'g3')
            ;
        const groupMap = new AdabasMap()
            .group(alphaMap, 'GR')
            ;
        const alpha = { g1: 'b', g2: 'aaaa', g3: 'cc' };

        const obj = groupMap.getObject(Buffer.from('baaaacc'), false);
        expect(obj).toMatchObject({ GR: alpha });
    });

    test('expect that the object with a periodic group field is correctly created from the buffer', () => {
        const alphaMap = new AdabasMap()
            .alpha(1, 'g1')
            .alpha(4, 'g2')
            .alpha(2, 'g3')
            ;
        const groupMap = new AdabasMap()
            .group(alphaMap, 'PE', { occ: 3 })
            ;
        const alpha = [{ g2: 'aaaa', g1: 'b', g3: 'cc' }, { g2: 'dddd', g1: 'e', g3: 'ff' }, { g2: 'gggg', g1: 'h', g3: 'ii' }];

        const obj = groupMap.getObject(Buffer.from('behaaaaddddggggccffii'), false);
        expect(obj).toMatchObject({ PE: alpha });

    });

});
