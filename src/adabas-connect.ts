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

import { AdabasTcp } from './adabas-tcp';

// ---------------------------------------------------------------------------
// ADATCP connect-packet constants
// ---------------------------------------------------------------------------

/** Total length of the connect handshake packet. */
const CONNECT_PACKET_LENGTH = 112;

/** Packet type value for a connect request. */
const CONNECT_PACKET_TYPE = 1;

// Header field offsets (shared with adabas-call.ts wire format)
const HDR_EYECATCHER = 0;   // 6 bytes  — 'ADATCP'
const HDR_VERSION    = 6;   // 2 bytes  — '01'
const HDR_TOTAL_LEN  = 8;   // UInt32BE — total packet length
const HDR_TYPE       = 12;  // UInt32BE — packet type

// Connect-specific field offsets
const CONNECT_ENDIAN  = 104; // Int8 — byte order (2 = little-endian)
const CONNECT_CHARSET = 105; // Int8 — character set (1 = UTF-8)
const CONNECT_FLOAT   = 106; // Int8 — floating-point format (1 = IEEE 754)

// Response field offsets
const RESPONSE_UUID_START = 16;
const RESPONSE_UUID_END   = 32;

// ---------------------------------------------------------------------------
// AdabasConnect
// ---------------------------------------------------------------------------

export class AdabasConnect {
    private readonly adabas: AdabasTcp;

    constructor(client: AdabasTcp) {
        this.adabas = client;
    }

    async connect(): Promise<Buffer> {
        const data = await this.adabas.send(this.buildConnectPacket());
        return data.subarray(RESPONSE_UUID_START, RESPONSE_UUID_END);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private buildConnectPacket(): Buffer {
        const buffer = Buffer.alloc(CONNECT_PACKET_LENGTH);

        buffer.write('ADATCP', HDR_EYECATCHER,  6, 'utf8');
        buffer.write('01',     HDR_VERSION,     2, 'utf8');
        buffer.writeUInt32BE(CONNECT_PACKET_LENGTH, HDR_TOTAL_LEN);
        buffer.writeUInt32BE(CONNECT_PACKET_TYPE,   HDR_TYPE);
        buffer.writeInt8(2, CONNECT_ENDIAN);
        buffer.writeInt8(1, CONNECT_CHARSET);
        buffer.writeInt8(1, CONNECT_FLOAT);

        return buffer;
    }
}