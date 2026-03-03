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

import { AdabasMap } from '../../src/adabas-map';
import { FileDescriptionTable } from '../../src/file-description-table';
import { FdtField } from '../../src/interfaces';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const host: string = config.get('AdaTcp.host');
const port: number = config.get('AdaTcp.port');
const fnr:  number = config.get('Test.employeeFile');

// ---------------------------------------------------------------------------
// Expected data — defined once, used by both tests
// ---------------------------------------------------------------------------

/**
 * Expected FDT for the employee demo file.
 * Defined at module level so the getFDT and getMap tests can reference the
 * same source of truth without duplication.
 */
const EXPECTED_FDT: FdtField[] = [
    { level: 1, name: 'AA', options: ['UQ', 'DE'],       format: 'A', length:  8 },
    { level: 1, name: 'AB', type: 'GR' },
    { level: 2, name: 'AC', options: ['NU'],              format: 'A', length: 20 },
    { level: 2, name: 'AE', options: ['DE'],              format: 'A', length: 20 },
    { level: 2, name: 'AD', options: ['NU'],              format: 'A', length: 20 },
    { level: 1, name: 'AF', options: ['FI'],              format: 'A', length:  1 },
    { level: 1, name: 'AG', options: ['FI'],              format: 'A', length:  1 },
    { level: 1, name: 'AH', options: ['DE', 'NC'],        format: 'P', length:  4 },
    { level: 1, name: 'A1', type: 'GR' },
    { level: 2, name: 'AI', options: ['NU', 'MU'],        format: 'A', length: 20 },
    { level: 2, name: 'AJ', options: ['NU', 'DE'],        format: 'A', length: 20 },
    { level: 2, name: 'AK', options: ['NU'],              format: 'A', length: 10 },
    { level: 2, name: 'AL', options: ['NU'],              format: 'A', length:  3 },
    { level: 1, name: 'A2', type: 'GR' },
    { level: 2, name: 'AN', options: ['NU'],              format: 'A', length:  6 },
    { level: 2, name: 'AM', options: ['NU'],              format: 'A', length: 15 },
    { level: 1, name: 'AO', options: ['DE'],              format: 'A', length:  6 },
    { level: 1, name: 'AP', options: ['NU', 'DE'],        format: 'A', length: 25 },
    { level: 1, name: 'AQ', type: 'PE' },
    { level: 2, name: 'AR', options: ['NU'],              format: 'A', length:  3 },
    { level: 2, name: 'AS', options: ['NU'],              format: 'P', length:  5 },
    { level: 2, name: 'AT', options: ['NU', 'MU'],        format: 'P', length:  5 },
    { level: 1, name: 'A3', type: 'GR' },
    { level: 2, name: 'AU',                               format: 'U', length:  2 },
    { level: 2, name: 'AV', options: ['NU'],              format: 'U', length:  2 },
    { level: 1, name: 'AW', type: 'PE' },
    { level: 2, name: 'AX', options: ['NU'],              format: 'U', length:  8 },
    { level: 2, name: 'AY', options: ['NU'],              format: 'U', length:  8 },
    { level: 1, name: 'AZ', options: ['NU', 'MU', 'DE'], format: 'A', length:  3 },
];

// ---------------------------------------------------------------------------
// FDT Tests
// ---------------------------------------------------------------------------

describe('FDT Tests', () => {

    // NOTE: FileDescriptionTable is single-use by design — getFDT() closes
    // and destroys the TCP socket at the end of each call. A fresh instance
    // must be created for every test.

    // -----------------------------------------------------------------------
    // getFDT
    // -----------------------------------------------------------------------

    describe('getFDT', () => {

        test('returns the correct field definitions for the employee file', async () => {
            const result = await new FileDescriptionTable(host, port).getFDT(fnr);
            expect(result).toStrictEqual(EXPECTED_FDT);
        });

        test('returns an empty array for a non-existent file number', async () => {
            // FileDescriptionTable returns [] for unknown files.
            // The "File does not exist" error is raised one level up by Adabas.readFDT().
            const result = await new FileDescriptionTable(host, port).getFDT(99999);
            expect(result).toEqual([]);
        });
    });

    // -----------------------------------------------------------------------
    // getMap
    // -----------------------------------------------------------------------

    describe('getMap', () => {

        test('returns an AdabasMap that serialises to the same JS as a hand-built equivalent', async () => {
            const map = await new FileDescriptionTable(host, port).getMap(fnr);

            // Build the expected map structure in the same way application
            // code would — using the FDT field names as both short and long names.
            const expectedMap = new AdabasMap()
                .alpha(8, 'AA', { name: 'AA' })
                .group(
                    new AdabasMap()
                        .alpha(20, 'AC', { name: 'AC' })
                        .alpha(20, 'AE', { name: 'AE' })
                        .alpha(20, 'AD', { name: 'AD' }),
                    'AB', { name: 'AB' })
                .alpha(1, 'AF', { name: 'AF' })
                .alpha(1, 'AG', { name: 'AG' })
                .packed(4, 'AH', { name: 'AH' })
                .group(
                    new AdabasMap()
                        .alpha(20, 'AI', { name: 'AI', occ: 10 })
                        .alpha(20, 'AJ', { name: 'AJ' })
                        .alpha(10, 'AK', { name: 'AK' })
                        .alpha(3,  'AL', { name: 'AL' }),
                    'A1', { name: 'A1' })
                .group(
                    new AdabasMap()
                        .alpha(6,  'AN', { name: 'AN' })
                        .alpha(15, 'AM', { name: 'AM' }),
                    'A2', { name: 'A2' })
                .alpha(6,  'AO', { name: 'AO' })
                .alpha(25, 'AP', { name: 'AP' })
                .group(
                    new AdabasMap()
                        .alpha(3,  'AR', { name: 'AR' })
                        .packed(5, 'AS', { name: 'AS' })
                        .packed(5, 'AT', { name: 'AT', occ: 10 }),
                    'AQ', { name: 'AQ', occ: 10 })
                .group(
                    new AdabasMap()
                        .unpacked(2, 'AU', { name: 'AU' })
                        .unpacked(2, 'AV', { name: 'AV' }),
                    'A3', { name: 'A3' })
                .group(
                    new AdabasMap()
                        .unpacked(8, 'AX', { name: 'AX' })
                        .unpacked(8, 'AY', { name: 'AY' }),
                    'AW', { name: 'AW', occ: 10 })
                .alpha(3, 'AZ', { name: 'AZ', occ: 10 });

            expect(map.toJs()).toBe(expectedMap.toJs());
        });

        test('returns an empty map for a non-existent file number', async () => {
            // getMap delegates to getFDT which returns [] for unknown files,
            // producing an empty AdabasMap. The throw only happens in Adabas.readFDT().
            const map = await new FileDescriptionTable(host, port).getMap(99999);
            expect(map.list).toHaveLength(0);
        });
    });
});