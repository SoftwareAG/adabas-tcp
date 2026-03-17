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

import { AdabasBufferStructure } from './adabas-buffer-structure';
import { ControlBlock } from './control-block';
import { AdabasMap } from './adabas-map';
import { LogEvent } from './adabas-call';

// ---------------------------------------------------------------------------
// CallType
// ---------------------------------------------------------------------------

export enum CallType { Create, Delete, Read, Update, Close, ET, BT, Undefined }

// ---------------------------------------------------------------------------
// Domain record types
// ---------------------------------------------------------------------------

/**
 * A single Adabas record as returned to callers.
 * The optional `_isn` field is injected by the driver to allow cursor tracking.
 */
export type AdabasRecord = Record<string, unknown> & { _isn?: number };

/**
 * Type of a structured field entry in the Adabas FDT (File Description Table).
 * Kept here so both adabas.ts and file-description-table.ts share the same shape.
 */
export type FdtFieldType = 'PE' | 'GR';

export interface FdtField {
    level:    number;
    name:     string;
    type?:    FdtFieldType;
    format?:  string;
    length?:  number;
    options?: string[];
}

/**
 * Raw FDT data returned by the database — an array of typed field descriptors.
 */
export type FdtResult = FdtField[];

// ---------------------------------------------------------------------------
// CallData
// ---------------------------------------------------------------------------

export interface CallData {
    map?: AdabasMap;
    fnr?: number;
    /** Numeric ISN for direct record access; string range ("1-100") for bulk reads. */
    isn?: number | string;
    /** The record object to store or update. */
    object?: AdabasRecord;
    criteria?: string;
    fields?: string[];
    sortedBy?: string;
    page?: number;
}

/**
 * Typed variant of CallData — use with create() and update() to gain full
 * type-safety on the `object` field.
 *
 * @example
 * const data: TypedCallData<Employee> = { map: employeeMap, object: { name: 'Ada', salary: 50000 } };
 * await adabas.create<Employee>(data);
 */
export interface TypedCallData<T extends AdabasRecord = AdabasRecord>
    extends Omit<CallData, 'object'> {
    object?: T;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface AdabasOptions {
    multifetch?: number;
    log?: LogEvent[];
}

// ---------------------------------------------------------------------------
// Low-level payload
// ---------------------------------------------------------------------------

export interface PayloadData {
    cb: ControlBlock;
    abda: AdabasBufferStructure;
    uuid?: Buffer;
}

// ---------------------------------------------------------------------------
// Map metadata
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Multifetch
// ---------------------------------------------------------------------------

export interface MultifetchElement {
    len: number;
    error: number;
    isn: number;
}

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

/**
 * Entry in the TCP send queue (adabas-tcp layer).
 */
export interface QueueElement {
    data: Buffer;
    resolve: (value: Buffer) => void;
    reject:  (reason: Error) => void;
}

/**
 * Entry in the Adabas command queue.
 * `_fn` holds the operation closure; `resolve` and `reject` settle the
 * Promise that was returned to the original caller.
 */
export interface CommandQueue {
    _fn:     () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject:  (reason: Error)  => void;
}