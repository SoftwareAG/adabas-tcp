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

import * as config from 'config';

import { Adabas } from '../../src/adabas';
import { AdabasMap } from '../../src/adabas-map';


describe('Adabas Integration Tests', () => {

    const host = config.get('AdaTcp.host') as string;
    const port = config.get('AdaTcp.port') as number;

    const fileNumber = config.get('Test.employeeFile') as number;

    let adabas: Adabas;
    let map: AdabasMap;

    beforeEach(() => {
        // instanciate a new Adabas object with database number from configuration
        adabas = new Adabas(host, port);

        // instanciate a new AdabasMap object with file number for the employee file
        map = new AdabasMap(fileNumber);
    });

    afterEach(async () => {
        await adabas.close();
        adabas.disconnect();
    });

    test('expect connect is successful', async () => {
        const uuid = await adabas.connect();
        expect(uuid.length).toBeGreaterThan(0);
    });

    test('expect close is successful', async () => {
        await adabas.close();
    });

    test('expect number of record to be 1107 when all records are read of employees file', async () => {
        map.alpha(8, 'AA');

        const result = await adabas.read({ map });
        expect(result.length).toBe(1107);
    });

    test('expect number of record to be 1107 when all records are read of file 11', async () => {
        const result = await adabas.read({ fnr: 11, fields: ['AA'] });
        expect(result.length).toBe(1107);
    });

    test('expect object when read record with ISN 207', async () => {
        map
            .alpha(8, 'AA', { name: 'Personnel Id' })
            .alpha(20, 'AC', { name: 'First Name' })
            .alpha(20, 'AE', { name: 'Name' })
            .alpha(20, 'AD', { name: 'Middle Name' })
            .alpha(20, 'AJ', { name: 'City' })
            .alpha(3, 'AL', { name: 'Country' })
            .alpha(3, 'AZ', { name: 'Language', occ: 5 }) // multiple field
            ;

        // do the call
        const value = await adabas.read({ map, isn: 207 });
        expect(value).toEqual({
            ISN: 207,
            'Personnel Id': '11100107',
            'First Name': 'HELGA',
            Name: 'SCHMIDT',
            'Middle Name': 'GERDA',
            City: 'HEPPENHEIM',
            Country: 'D',
            Language: ['GER', 'FRE']
        });
    });

    test('expect object when read record with periodic group ISN 250', async () => {
        const income = new AdabasMap()
            .alpha(3, 'AR', { name: 'Currency Code' })
            .packed(5, 'AS', { name: 'Salary' })
            .packed(5, 'AT', { name: 'Bonus', occ: 5 }) // multiple field within periodic group
            ;
        map
            .alpha(8, 'AA', { name: 'Personnel Id' })
            .alpha(20, 'AC', { name: 'First Name' })
            .alpha(20, 'AE', { name: 'Name' })
            .alpha(3, 'AZ', { name: 'Language', occ: 5 }) // multiple field
            .group(income, 'AQ', { name: 'Income', occ: 6 });

        // do the call
        const value = await adabas.read({ map, isn: 250 });
        expect(value).toEqual({
            ISN: 250,
            'Personnel Id': '11222222',
            'First Name': 'ANTONIA',
            Name: 'MARTENS',
            Language: ['GER', 'TUR'],
            Income: [{
                Bonus: [4615, 8000],
                'Currency Code': 'EUR',
                Salary: 29743
            },
            {
                Bonus: [3589, 6000],
                'Currency Code': 'EUR',
                Salary: 22153
            },
            {
                Bonus: [1538],
                'Currency Code': 'EUR',
                Salary: 20769
            }
            ],
        });
    });

    test('expect that a record can be successfully created', async () => {
        // define a map for data access first
        map
            .alpha(8, 'AA', { name: 'Personnel Id' })
            .alpha(20, 'AC', { name: 'First Name' })
            .alpha(20, 'AE', { name: 'Name' })
            .alpha(20, 'AD', { name: 'Middle Name' })
            .alpha(20, 'AJ', { name: 'City' })
            .alpha(3, 'AL', { name: 'Country' });

        const object = {
            'Personnel Id': 'Test1234',
            'First Name': 'FirstName',
            'Name': 'Name',
            'Middle Name': 'MiddleName',
            'City': 'City',
            'Country': 'Cou'
        }

        // do the call
        const isn = await adabas.create({ map, object });
        await adabas.endTransaction();
        expect(isn).toBeGreaterThan(0);

    });

    test('expect that a record can be successfully created with multiple field and periodic group', async () => {
        const income = new AdabasMap()
            .alpha(3, 'AR', { name: 'Currency Code' })
            .packed(5, 'AS', { name: 'Salary' })
            .packed(5, 'AT', { name: 'Bonus', occ: 5 }) // multiple field within periodic group
            ;

        const fullName = new AdabasMap()
            .alpha(20, 'AC', { name: 'First Name' })
            .alpha(20, 'AE', { name: 'Name' });


        // define a map for data access first
        map
            .alpha(8, 'AA', { name: 'Personnel Id' })
            .group(fullName, 'AB', { name: 'FullName' })
            .alpha(20, 'AE', { name: 'Name' })
            .alpha(3, 'AZ', { name: 'Language', occ: 5 }) // multiple field
            .group(income, 'AQ', { name: 'Income', occ: 6 });

        const create = {
            'Personnel Id': 'Test1235',
            FullName: {
                'First Name': 'FirstName',
                'Name': 'Name'
            },
            Language: ['GER', 'ENG', 'ESP'],
            Income: [{
                Bonus: [15321, 12343, 10236, 4321, 39843],
                'Currency Code': 'EUR',
                Salary: 79743
            },
            {
                Bonus: [6563, 1234],
                'Currency Code': 'EUR',
                Salary: 81234
            },
            {
                Bonus: [1538],
                'Currency Code': 'EUR',
                Salary: 85021
            }
            ]
        }

        // do the call
        const isn = await adabas.create({ map, object: create });
        await adabas.endTransaction();

        expect(isn).toBeGreaterThan(0);

    });

    test('expect that the fields are changed when a record is updated', async () => {
        // define a map for the data access
        map
            .alpha(8, 'AA', { name: 'Personnel Id' })
            .alpha(20, 'AJ', { name: 'City' })
            .alpha(3, 'AL', { name: 'Country' });

        const update = {
            'City': 'MANSFIELD',
            'Country': 'UK'
        }

        // do the call
        const isn = await adabas.update({ map, criteria: 'Personnel Id=Test1234', object: update });

        await adabas.endTransaction();
        expect(isn).toBeGreaterThan(0);

        // read update object
        const obj = await adabas.read({ map, isn });
        expect(obj.City).toBe(update.City);
        expect(obj.Country).toBe(update.Country);
    });

    test('expect that a record can be successfully be deleted (Test1234)', async () => {
        // define a map for the data access
        map
            .alpha(8, 'AA', { name: 'Personnel Id' });

        // do the call to delete Personnel Id=Test1234
        const isn = await adabas.delete({ map, criteria: 'Personnel Id=Test1234' });
        await adabas.endTransaction();

        expect(isn).toBeGreaterThan(0);
    });

    test('expect that a record can be successfully be deleted (Test1235)', async () => {
        // define a map for the data access
        map
            .alpha(8, 'AA', { name: 'Personnel Id' });

        // do the call to delete Personnel Id=Test1235
        const isn = await adabas.delete({ map, criteria: 'Personnel Id=Test1235' });
        await adabas.endTransaction();

        expect(isn).toBeGreaterThan(0);
    });

    test('expect an exception when an not existing ISN is get', async () => {
        map
            .alpha(8, 'AA', { name: 'Personnel Id' });

        let error;
        try {
            await adabas.read({ map, isn: 20000 });
        } catch (err) {
            error = err;
        }
        expect(error.message).toBe('Adabas response code 3 received. An end-of-file or end-of-list condition was detected.');
    });

    test('expect object when read record with ISN 207 without map', async () => {
        // do the call
        const value = await adabas.read({ fnr: fileNumber, isn: 207 });

        expect(value).toEqual(
            {
                ISN: 207,
                AA: '11100107',
                AB: { AC: 'HELGA', AE: 'SCHMIDT', AD: 'GERDA' },
                AF: 'S',
                AG: 'F',
                AH: 716385,
                A1:
                {
                    AI: ['AM ELFENGRUND 3', '6148 HEPPENHEIM'],
                    AJ: 'HEPPENHEIM',
                    AK: '6148',
                    AL: 'D'
                },
                A2: { AN: '06252', AM: '34128' },
                AO: 'MGMT21',
                AP: 'SEKRETAERIN',
                AQ:
                    [{ AR: 'EUR', AS: 18461, AT: [1025] },
                    { AR: 'EUR', AS: 16410, AT: [] }],
                A3: { AU: 22, AV: 20 },
                AW:
                    [{ AX: 19980101, AY: 19980112 },
                    { AX: 19980701, AY: 19980705 },
                    { AX: 19981225, AY: 19981229 }],
                AZ: ['GER', 'FRE']
            }
        );

    });

    test('expect that only selected fields of an object are returned when a ISN is read', async () => {
        // define a map for the data access
        map
            .alpha(8, 'AA', { name: 'Personnel Id' })
            .alpha(20, 'AC', { name: 'First Name' })
            .alpha(20, 'AE', { name: 'Name' })
            .alpha(20, 'AD', { name: 'Middle Name' })
            .alpha(20, 'AJ', { name: 'City' })
            .alpha(3, 'AL', { name: 'Country' })
            .alpha(3, 'AZ', { name: 'Language', occ: 5 }) // multiple field
            ;

        // do the call
        const value = await adabas.read({ map, fields: ['Name', 'City'], isn: 207 });

        expect(value).toEqual({
            'ISN': 207,
            'City': 'HEPPENHEIM',
            'Name': 'SCHMIDT'
        });
    });

    test('expect that a date format is correctly read', async () => {
        // define a map for the data access
        map
            .alpha(8, 'AA', { name: 'Personnel Id' })
            .alpha(20, 'AE', { name: 'Name' })
            .packed(4, 'AH', { name: 'Birth', format: 'date' });

        const value = await adabas.read({ map, isn: 207 });
        expect(value.Birth.toUTCString()).toBe('Thu, 25 May 1961 00:00:00 GMT');
    });

    test('expect object when read record with ISN 97 - show only one MU occurance', async () => {
        map
            .alpha(3, 'AZ', { name: 'Language', occ: 1 }) // multiple field
            ;

        // do the call
        const value = await adabas.read({ map, isn: 97 });
        expect(value).toEqual({
            ISN: 97,
            Language: ['FRE']
        });
    });

    test('expect object when read record with ISN 97 - show all MU occurances', async () => {
        map
            .alpha(3, 'AZ', { name: 'Language', occ: 5 }) // multiple field
            ;

        // do the call
        const value = await adabas.read({ map, isn: 97 });
        expect(value).toEqual({
            ISN: 97,
            Language: ['FRE', 'ENG']
        });
    });

    test('expect object when read record with periodic group ISN 237 - show 3 occurrances', async () => {
        const income = new AdabasMap()
            .alpha(3, 'AR', { name: 'Currency Code' })
            .packed(5, 'AS', { name: 'Salary' })
            .packed(5, 'AT', { name: 'Bonus', occ: 5 }) // multiple field within periodic group
            ;
        map
            .group(income, 'AQ', { name: 'Income', occ: 3 });

        // do the call
        const value = await adabas.read({ map, isn: 237 });
        expect(value).toEqual({
            ISN: 237,
            Income: [{
                Bonus: [1282],
                'Currency Code': 'EUR',
                Salary: 24358
            },
            {
                Bonus: [1025],
                'Currency Code': 'EUR',
                Salary: 23076
            },
            {
                Bonus: [],
                'Currency Code': 'EUR',
                Salary: 21538
            }
            ],
        });
    });

    test('expect object when read record with periodic group ISN 237 - show all occurrances', async () => {
        const income = new AdabasMap()
            .alpha(3, 'AR', { name: 'Currency Code' })
            .packed(5, 'AS', { name: 'Salary' })
            .packed(5, 'AT', { name: 'Bonus', occ: 5 }) // multiple field within periodic group
            ;
        map
            .group(income, 'AQ', { name: 'Income', occ: 6 });

        // do the call
        const value = await adabas.read({ map, isn: 237 });
        expect(value).toEqual({
            ISN: 237,
            Income: [{
                Bonus: [1282],
                'Currency Code': 'EUR',
                Salary: 24358
            },
            {
                Bonus: [1025],
                'Currency Code': 'EUR',
                Salary: 23076
            },
            {
                Bonus: [],
                'Currency Code': 'EUR',
                Salary: 21538
            },
            {
                Bonus: [],
                'Currency Code': 'EUR',
                Salary: 20512
            },
            {
                Bonus: [],
                'Currency Code': 'EUR',
                Salary: 19743
            }
            ],
        });
    });

    test('expect specific objects when read record with ISN range', async () => {
        map
            .alpha(8, 'AA', { name: 'Personnel Id' })
            .alpha(20, 'AC', { name: 'First Name' })
            .alpha(20, 'AE', { name: 'Name' })
            .alpha(3, 'AZ', { name: 'Language', occ: 5 }) // multiple field

        // do the call
        const value = await adabas.read({ map, isn: "5-7" });
        expect(value).toEqual([
            {
                ISN: 5,
                'Personnel Id': '50004900',
                "First Name": "ALBERT",
                Name: 'CAOUDAL',
                Language: ['FRE', 'ENG']
            }, {
                ISN: 6,
                'Personnel Id': '50004600',
                "First Name": "BERNARD",
                Name: 'VERDIE',
                Language: ['FRE', 'ENG']
            }, {
                ISN: 7,
                'Personnel Id': '50004300',
                "First Name": "MICHELE",
                Name: 'GUERIN',
                Language: ['FRE', 'ENG']
            }
        ]);
    });

    test('expect read with criteria return only records that meet the criteria', async () => {
        map
            .alpha(8, 'AA', { name: 'Personnel Id' })
            .alpha(20, 'AC', { name: 'First Name' })
            .alpha(20, 'AE', { name: 'Name' })
            .alpha(3, 'AZ', { name: 'Language', occ: 5 }) // multiple field

        // do the call
        const value = await adabas.read({ map, criteria: 'Name=SMITH' });
        expect(value).toEqual([
            {
                ISN: 526,
                'Personnel Id': '40000311',
                'First Name': 'GERHARD',
                Name: 'SMITH',
                Language: ['DAN', 'FRE', 'ENG']
            },
            {
                ISN: 581,
                'Personnel Id': '20009300',
                'First Name': 'SEYMOUR',
                Name: 'SMITH',
                Language: ['ENG']
            },
            {
                ISN: 626,
                'Personnel Id': '20014100',
                'First Name': 'MATILDA',
                Name: 'SMITH',
                Language: ['ENG']
            },
            {
                ISN: 639,
                'Personnel Id': '20015400',
                'First Name': 'ANN',
                Name: 'SMITH',
                Language: ['ENG']
            },
            {
                ISN: 669,
                'Personnel Id': '20018800',
                'First Name': 'TONI',
                Name: 'SMITH',
                Language: ['ENG', 'DUT']
            },
            {
                ISN: 716,
                'Personnel Id': '20023600',
                'First Name': 'MARTIN',
                Name: 'SMITH',
                Language: ['ENG']
            },
            {
                ISN: 732,
                'Personnel Id': '20025200',
                'First Name': 'THOMAS',
                Name: 'SMITH',
                Language: ['ENG', 'GER', 'ICE', 'JAP']
            },
            {
                ISN: 776,
                'Personnel Id': '20029800',
                'First Name': 'SUNNY',
                Name: 'SMITH',
                Language: ['ENG']
            },
            {
                ISN: 785,
                'Personnel Id': '20000400',
                'First Name': 'MARK',
                Name: 'SMITH',
                Language: ['ENG']
            },
            {
                ISN: 791,
                'Personnel Id': '20001000',
                'First Name': 'LOUISE',
                Name: 'SMITH',
                Language: ['ENG']
            },
            {
                ISN: 799,
                'Personnel Id': '20001900',
                'First Name': 'MAXWELL',
                Name: 'SMITH',
                Language: ['ENG']
            },
            {
                ISN: 807,
                'Personnel Id': '20002300',
                'First Name': 'ELSA',
                Name: 'SMITH',
                Language: ['ENG']
            },
            {
                ISN: 816,
                'Personnel Id': '20003200',
                'First Name': 'CHARLY',
                Name: 'SMITH',
                Language: ['ENG']
            },
            {
                ISN: 822,
                'Personnel Id': '20003900',
                'First Name': 'LEE',
                Name: 'SMITH',
                Language: ['ENG']
            },
            {
                ISN: 852,
                'Personnel Id': '30000001',
                'First Name': 'FRANK',
                Name: 'SMITH',
                Language: ['ENG', 'GER']
            },
            {
                ISN: 876,
                'Personnel Id': '30000311',
                'First Name': 'GERALD',
                Name: 'SMITH',
                Language: ['ENG', 'GER', 'FRE', 'SPA']
            },
            {
                ISN: 1052,
                'Personnel Id': '30034001',
                'First Name': 'FRANCIS',
                Name: 'SMITH',
                Language: ['ENG']
            },
            {
                ISN: 1070,
                'Personnel Id': '30038013',
                'First Name': 'WINSTON',
                Name: 'SMITH',
                Language: ['ENG']
            },
            {
                ISN: 1106,
                'Personnel Id': '20000000',
                'First Name': 'JUNE',
                Name: 'SMITH',
                Language: ['ENG', 'CHI', 'SPA']
            }
        ]);
    });

    test('expect read of a wide field works correctly', async () => {
        map = new AdabasMap(9)
            .wide(40, 'BA')
            .wide(40, 'BB')
            .wide(50, 'BC');
        const result = await adabas.read({ map, isn: 1259 });
        expect(result).toEqual(
            {
                ISN: 1259,
                BA: 'संदीप',
                BB: 'देशमुख',
                BC: 'दिलीप'
            }
        );
    });
});