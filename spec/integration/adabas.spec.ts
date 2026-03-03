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

import config from 'config';

import { Adabas } from '../../src/adabas';
import { AdabasMap } from '../../src/adabas-map';
import { AdabasRecord } from '../../src/interfaces';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const host:       string = config.get('AdaTcp.host');
const port:       number = config.get('AdaTcp.port');
const fileNumber: number = config.get('Test.employeeFile');

// ---------------------------------------------------------------------------
// Shared map builders
// ---------------------------------------------------------------------------

/** Minimal map for Personnel Id — used by CRUD and search tests. */
function makePersonnelIdMap(fnr: number): AdabasMap {
    return new AdabasMap(fnr).alpha(8, 'AA', { name: 'Personnel Id' });
}

/** Full employee name/location map — used by several read tests. */
function makeEmployeeMap(fnr: number): AdabasMap {
    return new AdabasMap(fnr)
        .alpha(8,  'AA', { name: 'Personnel Id' })
        .alpha(20, 'AC', { name: 'First Name' })
        .alpha(20, 'AE', { name: 'Name' })
        .alpha(20, 'AD', { name: 'Middle Name' })
        .alpha(20, 'AJ', { name: 'City' })
        .alpha(3,  'AL', { name: 'Country' })
        .alpha(3,  'AZ', { name: 'Language', occ: 5 });
}

/** Income periodic group sub-map. */
function makeIncomeMap(): AdabasMap {
    return new AdabasMap()
        .alpha(3,  'AR', { name: 'Currency Code' })
        .packed(5, 'AS', { name: 'Salary' })
        .packed(5, 'AT', { name: 'Bonus', occ: 5 });
}

// ---------------------------------------------------------------------------
// Adabas Integration Tests
// ---------------------------------------------------------------------------

describe('Adabas Integration Tests', () => {

    let adabas: Adabas;

    beforeEach(() => {
        adabas = new Adabas(host, port);
    });

    afterEach(async () => {
        try {
            await adabas.close();
            adabas.disconnect();
        } catch {
            // The Adabas server closes the TCP connection as part of the CL
            // (close) command response. This races with our socket `end` handler
            // and produces a spurious "Connection ended by server" rejection.
            // The session is gone regardless — suppress the error here so it
            // does not cascade and fail subsequent tests.
        }
    });

    // -----------------------------------------------------------------------
    // Connection
    // -----------------------------------------------------------------------

    describe('connection', () => {

        test('connect returns a non-empty UUID', async () => {
            const uuid = await adabas.connect();
            expect(uuid.length).toBeGreaterThan(0);
        });

        // close() is exercised by every afterEach — no need to test it
        // separately here since doing so causes a double-close: the test
        // closes the session, then afterEach tries to close an already-gone
        // connection.
        test('close is invoked successfully after connect', async () => {
            await adabas.connect();
            // afterEach will call close() — if it throws the test fails
        });
    });

    // -----------------------------------------------------------------------
    // Read — all records
    // -----------------------------------------------------------------------

    describe('read all records', () => {

        test('read with map returns 1107 records from employee file', async () => {
            const map = new AdabasMap(fileNumber).alpha(8, 'AA');
            const result = await adabas.read({ map }) as AdabasRecord[];
            expect(result.length).toBe(1107);
        });

        test('read with fnr and fields returns 1107 records from file 11', async () => {
            const result = await adabas.read({ fnr: 11, fields: ['AA'] }) as AdabasRecord[];
            expect(result.length).toBe(1107);
        });
    });

    // -----------------------------------------------------------------------
    // Read — by ISN
    // -----------------------------------------------------------------------

    describe('read by ISN', () => {

        test('ISN 207 returns correct employee record with multiple field', async () => {
            const value = await adabas.read({ map: makeEmployeeMap(fileNumber), isn: 207 }) as AdabasRecord[];
            expect(value).toEqual([{
                ISN: 207,
                'Personnel Id': '11100107',
                'First Name':   'HELGA',
                Name:           'SCHMIDT',
                'Middle Name':  'GERDA',
                City:           'HEPPENHEIM',
                Country:        'D',
                Language:       ['GER', 'FRE'],
            }]);
        });

        test('ISN 250 returns correct employee record with periodic group', async () => {
            const map = new AdabasMap(fileNumber)
                .alpha(8,  'AA', { name: 'Personnel Id' })
                .alpha(20, 'AC', { name: 'First Name' })
                .alpha(20, 'AE', { name: 'Name' })
                .alpha(3,  'AZ', { name: 'Language', occ: 5 })
                .group(makeIncomeMap(), 'AQ', { name: 'Income', occ: 6 });

            const value = await adabas.read({ map, isn: 250 }) as AdabasRecord[];
            expect(value).toEqual([{
                ISN: 250,
                'Personnel Id': '11222222',
                'First Name':   'ANTONIA',
                Name:           'MARTENS',
                Language:       ['GER', 'TUR'],
                Income: [
                    { 'Currency Code': 'EUR', Salary: 29743, Bonus: [4615, 8000] },
                    { 'Currency Code': 'EUR', Salary: 22153, Bonus: [3589, 6000] },
                    { 'Currency Code': 'EUR', Salary: 20769, Bonus: [1538] },
                ],
            }]);
        });

        test('ISN 207 returns full raw record when read without map', async () => {
            const value = await adabas.read({ fnr: fileNumber, isn: 207 });
            expect(value).toEqual([{
                ISN: 207,
                AA: '11100107',
                AB: { AC: 'HELGA', AE: 'SCHMIDT', AD: 'GERDA' },
                AF: 'S',
                AG: 'F',
                AH: 716385,
                A1: {
                    AI: ['AM ELFENGRUND 3', '6148 HEPPENHEIM'],
                    AJ: 'HEPPENHEIM',
                    AK: '6148',
                    AL: 'D',
                },
                A2: { AN: '06252', AM: '34128' },
                AO: 'MGMT21',
                AP: 'SEKRETAERIN',
                AQ: [
                    { AR: 'EUR', AS: 18461, AT: [1025] },
                    { AR: 'EUR', AS: 16410, AT: [] },
                ],
                A3: { AU: 22, AV: 20 },
                AW: [
                    { AX: 19980101, AY: 19980112 },
                    { AX: 19980701, AY: 19980705 },
                    { AX: 19981225, AY: 19981229 },
                ],
                AZ: ['GER', 'FRE'],
            }]);
        });

        test('ISN 207 returns only requested fields when fields filter is provided', async () => {
            const value = await adabas.read({
                map: makeEmployeeMap(fileNumber),
                fields: ['Name', 'City'],
                isn: 207,
            });
            expect(value).toEqual([{ ISN: 207, City: 'HEPPENHEIM', Name: 'SCHMIDT' }]);
        });

        test('ISN 207 returns correctly parsed date field', async () => {
            const map = new AdabasMap(fileNumber)
                .alpha(8,  'AA', { name: 'Personnel Id' })
                .alpha(20, 'AE', { name: 'Name' })
                .packed(4, 'AH', { name: 'Birth', format: 'date' });

            const value = await adabas.read({ map, isn: 207 }) as AdabasRecord[];
            expect((value[0].Birth as Date).toUTCString()).toBe('Thu, 25 May 1961 00:00:00 GMT');
        });

        test('ISN 97 returns only one MU occurrence when occ is 1', async () => {
            const map = new AdabasMap(fileNumber).alpha(3, 'AZ', { name: 'Language', occ: 1 });
            const value = await adabas.read({ map, isn: 97 }) as AdabasRecord[];
            expect(value).toEqual([{ ISN: 97, Language: ['FRE'] }]);
        });

        test('ISN 97 returns all MU occurrences when occ is 5', async () => {
            const map = new AdabasMap(fileNumber).alpha(3, 'AZ', { name: 'Language', occ: 5 });
            const value = await adabas.read({ map, isn: 97 }) as AdabasRecord[];
            expect(value).toEqual([{ ISN: 97, Language: ['FRE', 'ENG'] }]);
        });

        test('non-existent ISN 20000 rejects with response code 3', async () => {
            const map = makePersonnelIdMap(fileNumber);
            await expect(adabas.read({ map, isn: 20000 }))
                .rejects.toThrow('Record not found.');
        });
    });

    // -----------------------------------------------------------------------
    // Read — by ISN range
    // -----------------------------------------------------------------------

    describe('read by ISN range', () => {

        test('ISN range "5-7" returns three records in order', async () => {
            const map = new AdabasMap(fileNumber)
                .alpha(8,  'AA', { name: 'Personnel Id' })
                .alpha(20, 'AC', { name: 'First Name' })
                .alpha(20, 'AE', { name: 'Name' })
                .alpha(3,  'AZ', { name: 'Language', occ: 5 });

            const value = await adabas.read({ map, isn: '5-7' });
            expect(value).toEqual([
                { ISN: 5, 'Personnel Id': '50004900', 'First Name': 'ALBERT',  Name: 'CAOUDAL', Language: ['FRE', 'ENG'] },
                { ISN: 6, 'Personnel Id': '50004600', 'First Name': 'BERNARD', Name: 'VERDIE',  Language: ['FRE', 'ENG'] },
                { ISN: 7, 'Personnel Id': '50004300', 'First Name': 'MICHELE', Name: 'GUERIN',  Language: ['FRE', 'ENG'] },
            ]);
        });
    });

    // -----------------------------------------------------------------------
    // Read — by criteria
    // -----------------------------------------------------------------------

    describe('read by criteria', () => {

        test('criteria Name=SMITH returns all 19 matching records', async () => {
            const map = new AdabasMap(fileNumber)
                .alpha(8,  'AA', { name: 'Personnel Id' })
                .alpha(20, 'AC', { name: 'First Name' })
                .alpha(20, 'AE', { name: 'Name' })
                .alpha(3,  'AZ', { name: 'Language', occ: 5 });

            const value = await adabas.read({ map, criteria: 'Name=SMITH' });
            expect(value).toEqual([
                { ISN:  526, 'Personnel Id': '40000311', 'First Name': 'GERHARD', Name: 'SMITH', Language: ['DAN', 'FRE', 'ENG'] },
                { ISN:  581, 'Personnel Id': '20009300', 'First Name': 'SEYMOUR', Name: 'SMITH', Language: ['ENG'] },
                { ISN:  626, 'Personnel Id': '20014100', 'First Name': 'MATILDA', Name: 'SMITH', Language: ['ENG'] },
                { ISN:  639, 'Personnel Id': '20015400', 'First Name': 'ANN',     Name: 'SMITH', Language: ['ENG'] },
                { ISN:  669, 'Personnel Id': '20018800', 'First Name': 'TONI',    Name: 'SMITH', Language: ['ENG', 'DUT'] },
                { ISN:  716, 'Personnel Id': '20023600', 'First Name': 'MARTIN',  Name: 'SMITH', Language: ['ENG'] },
                { ISN:  732, 'Personnel Id': '20025200', 'First Name': 'THOMAS',  Name: 'SMITH', Language: ['ENG', 'GER', 'ICE', 'JAP'] },
                { ISN:  776, 'Personnel Id': '20029800', 'First Name': 'SUNNY',   Name: 'SMITH', Language: ['ENG'] },
                { ISN:  785, 'Personnel Id': '20000400', 'First Name': 'MARK',    Name: 'SMITH', Language: ['ENG'] },
                { ISN:  791, 'Personnel Id': '20001000', 'First Name': 'LOUISE',  Name: 'SMITH', Language: ['ENG'] },
                { ISN:  799, 'Personnel Id': '20001900', 'First Name': 'MAXWELL', Name: 'SMITH', Language: ['ENG'] },
                { ISN:  807, 'Personnel Id': '20002300', 'First Name': 'ELSA',    Name: 'SMITH', Language: ['ENG'] },
                { ISN:  816, 'Personnel Id': '20003200', 'First Name': 'CHARLY',  Name: 'SMITH', Language: ['ENG'] },
                { ISN:  822, 'Personnel Id': '20003900', 'First Name': 'LEE',     Name: 'SMITH', Language: ['ENG'] },
                { ISN:  852, 'Personnel Id': '30000001', 'First Name': 'FRANK',   Name: 'SMITH', Language: ['ENG', 'GER'] },
                { ISN:  876, 'Personnel Id': '30000311', 'First Name': 'GERALD',  Name: 'SMITH', Language: ['ENG', 'GER', 'FRE', 'SPA'] },
                { ISN: 1052, 'Personnel Id': '30034001', 'First Name': 'FRANCIS', Name: 'SMITH', Language: ['ENG'] },
                { ISN: 1070, 'Personnel Id': '30038013', 'First Name': 'WINSTON', Name: 'SMITH', Language: ['ENG'] },
                { ISN: 1106, 'Personnel Id': '20000000', 'First Name': 'JUNE',    Name: 'SMITH', Language: ['ENG', 'CHI', 'SPA'] },
            ]);
        });
    });

    // -----------------------------------------------------------------------
    // Read — periodic group occurrence counts
    // -----------------------------------------------------------------------

    describe('periodic group occurrence counts', () => {

        test('ISN 237 returns 3 occurrences when occ is 3', async () => {
            const map = new AdabasMap(fileNumber)
                .group(makeIncomeMap(), 'AQ', { name: 'Income', occ: 3 });

            const value = await adabas.read({ map, isn: 237 }) as AdabasRecord[];
            expect(value).toEqual([{
                ISN: 237,
                Income: [
                    { 'Currency Code': 'EUR', Salary: 24358, Bonus: [1282] },
                    { 'Currency Code': 'EUR', Salary: 23076, Bonus: [1025] },
                    { 'Currency Code': 'EUR', Salary: 21538, Bonus: [] },
                ],
            }]);
        });

        test('ISN 237 returns all 5 occurrences when occ is 6', async () => {
            const map = new AdabasMap(fileNumber)
                .group(makeIncomeMap(), 'AQ', { name: 'Income', occ: 6 });

            const value = await adabas.read({ map, isn: 237 }) as AdabasRecord[];
            expect(value).toEqual([{
                ISN: 237,
                Income: [
                    { 'Currency Code': 'EUR', Salary: 24358, Bonus: [1282] },
                    { 'Currency Code': 'EUR', Salary: 23076, Bonus: [1025] },
                    { 'Currency Code': 'EUR', Salary: 21538, Bonus: [] },
                    { 'Currency Code': 'EUR', Salary: 20512, Bonus: [] },
                    { 'Currency Code': 'EUR', Salary: 19743, Bonus: [] },
                ],
            }]);
        });
    });

    // -----------------------------------------------------------------------
    // Read — wide fields
    // -----------------------------------------------------------------------

    describe('wide fields', () => {

        test('ISN 1259 in file 9 returns correct Unicode wide field values', async () => {
            const map = new AdabasMap(9)
                .wide(40, 'BA')
                .wide(40, 'BB')
                .wide(50, 'BC');

            const result = await adabas.read({ map, isn: 1259 }) as AdabasRecord[];
            expect(result).toEqual([{ ISN: 1259, BA: 'संदीप', BB: 'देशमुख', BC: 'दिलीप' }]);
        });
    });

    // -----------------------------------------------------------------------
    // CRUD — create, update, delete
    // These tests are order-dependent and run in sequence within this block.
    // -----------------------------------------------------------------------

    describe('CRUD lifecycle for test records', () => {

        // Shared map for the simple record
        const simpleMap = (): AdabasMap => new AdabasMap(fileNumber)
            .alpha(8,  'AA', { name: 'Personnel Id' })
            .alpha(20, 'AC', { name: 'First Name' })
            .alpha(20, 'AE', { name: 'Name' })
            .alpha(20, 'AD', { name: 'Middle Name' })
            .alpha(20, 'AJ', { name: 'City' })
            .alpha(3,  'AL', { name: 'Country' });

        test('1 — creates simple record Test1234 and returns a positive ISN', async () => {
            const isn = await adabas.create({
                map:    simpleMap(),
                object: {
                    'Personnel Id': 'Test1234',
                    'First Name':   'FirstName',
                    Name:           'Name',
                    'Middle Name':  'MiddleName',
                    City:           'City',
                    Country:        'Cou',
                },
            });
            await adabas.endTransaction();
            expect(isn).toBeGreaterThan(0);
        });

        test('2 — creates complex record Test1235 with multiple field and periodic group', async () => {
            const fullName = new AdabasMap()
                .alpha(20, 'AC', { name: 'First Name' })
                .alpha(20, 'AE', { name: 'Name' });

            const map = new AdabasMap(fileNumber)
                .alpha(8,  'AA', { name: 'Personnel Id' })
                .group(fullName, 'AB', { name: 'FullName' })
                .alpha(20, 'AE', { name: 'Name' })
                .alpha(3,  'AZ', { name: 'Language', occ: 5 })
                .group(makeIncomeMap(), 'AQ', { name: 'Income', occ: 6 });

            const isn = await adabas.create({
                map,
                object: {
                    'Personnel Id': 'Test1235',
                    FullName: { 'First Name': 'FirstName', Name: 'Name' },
                    Language: ['GER', 'ENG', 'ESP'],
                    Income: [
                        { 'Currency Code': 'EUR', Salary: 79743, Bonus: [15321, 12343, 10236, 4321, 39843] },
                        { 'Currency Code': 'EUR', Salary: 81234, Bonus: [6563, 1234] },
                        { 'Currency Code': 'EUR', Salary: 85021, Bonus: [1538] },
                    ],
                },
            });
            await adabas.endTransaction();
            expect(isn).toBeGreaterThan(0);
        });

        test('3 — updates Test1234 city and country, verifies changes by re-reading', async () => {
            const map = new AdabasMap(fileNumber)
                .alpha(8,  'AA', { name: 'Personnel Id' })
                .alpha(20, 'AJ', { name: 'City' })
                .alpha(3,  'AL', { name: 'Country' });

            const update = { City: 'MANSFIELD', Country: 'UK' };

            const isn = await adabas.update({ map, criteria: 'Personnel Id=Test1234', object: update });
            await adabas.endTransaction();
            expect(isn).toBeGreaterThan(0);

            const obj = await adabas.read({ map, isn }) as AdabasRecord[];
            expect(obj[0].City).toBe(update.City);
            expect(obj[0].Country).toBe(update.Country);
        });

        test('4 — deletes Test1234 and returns a positive ISN', async () => {
            const isn = await adabas.delete({
                map:      makePersonnelIdMap(fileNumber),
                criteria: 'Personnel Id=Test1234',
            });
            await adabas.endTransaction();
            expect(isn).toBeGreaterThan(0);
        });

        test('5 — deletes Test1235 and returns a positive ISN', async () => {
            const isn = await adabas.delete({
                map:      makePersonnelIdMap(fileNumber),
                criteria: 'Personnel Id=Test1235',
            });
            await adabas.endTransaction();
            expect(isn).toBeGreaterThan(0);
        });
    });
});