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

import { AdabasMap } from './../../src/adabas-map';
import { FileDescriptionTable } from './../../src/file-description-table';


const host = config.get('AdaTcp.host') as string;
const port = config.get('AdaTcp.port') as number;

const fnr = config.get('Test.employeeFile') as number;

describe('FDT Tests', () => {

    test('expect read FDT successfully', async () => {
        expect(await new FileDescriptionTable(host, port).getFDT(fnr)).toStrictEqual([{
            level: 1,
            name: 'AA',
            options: ['UQ', 'DE'],
            format: 'A',
            length: 8
        },
        { level: 1, name: 'AB', type: 'GR' },
        {
            level: 2,
            name: 'AC',
            options: ['NU'],
            format: 'A',
            length: 20
        },
        {
            level: 2,
            name: 'AE',
            options: ['DE'],
            format: 'A',
            length: 20
        },
        {
            level: 2,
            name: 'AD',
            options: ['NU'],
            format: 'A',
            length: 20
        },
        { level: 1, name: 'AF', options: ['FI'], format: 'A', length: 1 },
        { level: 1, name: 'AG', options: ['FI'], format: 'A', length: 1 },
        { level: 1, name: 'AH', options: ['DE', 'NC'], format: 'P', length: 4 },
        { level: 1, name: 'A1', type: 'GR' },
        {
            level: 2,
            name: 'AI',
            options: ['NU', 'MU'],
            format: 'A',
            length: 20
        },
        {
            level: 2,
            name: 'AJ',
            options: ['NU', 'DE'],
            format: 'A',
            length: 20
        },
        {
            level: 2,
            name: 'AK',
            options: ['NU'],
            format: 'A',
            length: 10
        },
        { level: 2, name: 'AL', options: ['NU'], format: 'A', length: 3 },
        { level: 1, name: 'A2', type: 'GR' },
        { level: 2, name: 'AN', options: ['NU'], format: 'A', length: 6 },
        {
            level: 2,
            name: 'AM',
            options: ['NU'],
            format: 'A',
            length: 15
        },
        { level: 1, name: 'AO', options: ['DE'], format: 'A', length: 6 },
        {
            level: 1,
            name: 'AP',
            options: ['NU', 'DE'],
            format: 'A',
            length: 25
        },
        { level: 1, name: 'AQ', type: 'PE' },
        { level: 2, name: 'AR', options: ['NU'], format: 'A', length: 3 },
        { level: 2, name: 'AS', options: ['NU'], format: 'P', length: 5 },
        {
            level: 2,
            name: 'AT',
            options: ['NU', 'MU'],
            format: 'P',
            length: 5
        },
        { level: 1, name: 'A3', type: 'GR' },
        { level: 2, name: 'AU', format: 'U', length: 2 },
        { level: 2, name: 'AV', options: ['NU'], format: 'U', length: 2 },
        { level: 1, name: 'AW', type: 'PE' },
        { level: 2, name: 'AX', options: ['NU'], format: 'U', length: 8 },
        { level: 2, name: 'AY', options: ['NU'], format: 'U', length: 8 },
        {
            level: 1,
            name: 'AZ',
            options: ['NU', 'MU', 'DE'],
            format: 'A',
            length: 3
        }]);
    });

    test('expect get Map for a file is successful', async () => {
        const map = await new FileDescriptionTable(host, port).getMap(fnr);

        const AB = new AdabasMap()
            .alpha(20, 'AC', { name: 'AC' })
            .alpha(20, 'AE', { name: 'AE' })
            .alpha(20, 'AD', { name: 'AD' })
            ;
        const A1 = new AdabasMap()
            .alpha(20, 'AI', { name: 'AI', occ: 10 })
            .alpha(20, 'AJ', { name: 'AJ' })
            .alpha(10, 'AK', { name: 'AK' })
            .alpha(3, 'AL', { name: 'AL' })
            ;
        const A2 = new AdabasMap()
            .alpha(6, 'AN', { name: 'AN' })
            .alpha(15, 'AM', { name: 'AM' })
            ;
        const AQ = new AdabasMap()
            .alpha(3, 'AR', { name: 'AR' })
            .packed(5, 'AS', { name: 'AS' })
            .packed(5, 'AT', { name: 'AT', occ: 10 })
            ;
        const A3 = new AdabasMap()
            .unpacked(2, 'AU', { name: 'AU' })
            .unpacked(2, 'AV', { name: 'AV' })
            ;
        const AW = new AdabasMap()
            .unpacked(8, 'AX', { name: 'AX' })
            .unpacked(8, 'AY', { name: 'AY' })
            ;
        const Map = new AdabasMap()
            .alpha(8, 'AA', { name: 'AA' })
            .group(AB, 'AB', { name: 'AB' })
            .alpha(1, 'AF', { name: 'AF' })
            .alpha(1, 'AG', { name: 'AG' })
            .packed(4, 'AH', { name: 'AH' })
            .group(A1, 'A1', { name: 'A1' })
            .group(A2, 'A2', { name: 'A2' })
            .alpha(6, 'AO', { name: 'AO' })
            .alpha(25, 'AP', { name: 'AP' })
            .group(AQ, 'AQ', { name: 'AQ', occ: 10 })
            .group(A3, 'A3', { name: 'A3' })
            .group(AW, 'AW', { name: 'AW', occ: 10 })
            .alpha(3, 'AZ', { name: 'AZ', occ: 10 })
            ;
        expect(map.toJs()).toBe(Map.toJs());
    });

});