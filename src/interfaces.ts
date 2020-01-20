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

import { AdabasBufferStructure } from './adabas-buffer-structure';
import { ControlBlock } from './control-block';

import { AdabasMap } from './adabas-map';

export enum CallType { Create, Delete, Read, Update, Close, ET, BT, Undefined };

export interface CallData {
    map?: AdabasMap,
    fnr?: number,
    isn?: any,
    object?: any,
    criteria?: string,
    fields?: string[],
    sortedBy?: string,
    page?: number
}

export interface AdabasOptions {
    multifetch?: number;
    log?: string[];
}

export interface PayloadData {
    cb: ControlBlock;
    abda: AdabasBufferStructure;
    uuid?: Buffer;
}

export interface MapData {
    type: string;
    shortName: string;
    longName: string;
    format: string;
    length?: number;
    occ?: number;
    map?: AdabasMap;
    options?: MapOption;
    offset?: number;
}

export interface MapOption {
    format?: string;
    occ?: number;
    name?: string;
    prec?: number;
}

export interface MultifetchElement {
    len: number;
    error: number;
    isn: number;
}

export interface QueueElement {
    data: Buffer;
    resolve: Function;
    reject: Function;
}

export interface CommandQueue {
    type: CallType;
    data: CallData;
    resolve: Function;
    reject: Function;
}


