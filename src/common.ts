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

import { MultifetchElement } from './interfaces';

export function expandBuffer(buffer: Buffer, len: number): Buffer {
    const missing = len - buffer.length;
    if (missing > 0) return Buffer.concat([buffer, Buffer.alloc(missing)]);
    return buffer;
}

function formatOffset(offset: number) {
  let o = offset.toString(16);
  for (let index = o.length; index < 4; index++) {
      o = '0' + o;
  }
  return o;
}

function fillToLength(text: string, len: number, filler = ' ') {
  if (text.length < len) {
      for (let index = text.length; index < len; index++) {
          text += filler;
      }
  }
  return text;
}

export function hexdump(buffer: Buffer, text = 'Buffer'): string {
    let lines = text + ', length: ' + buffer.length + '\n';
    let pos = 0;
    let lastLine = '';
    let identical = 0;
    do {
        let hex = buffer.toString('hex', pos, pos + 4) + ' ' + buffer.toString('hex', pos + 4, pos + 8) + ' ' + buffer.toString('hex', pos + 8, pos + 12) + ' ' + buffer.toString('hex', pos + 12, pos + 16);
        if (hex === lastLine) {
            identical++;
        } else {
            if (identical > 0) {
                lines += '  Next ' + identical + ' lines are identical.\n'
                identical = 0;
            }
            lastLine = hex;
            hex = fillToLength(hex, 35);
            const ascii = buffer.toString('ascii', pos, pos + 16).replace(/[^\x20-\x7E]/g, '.');
            lines += formatOffset(pos) + '  ' + hex + '  *' + fillToLength(ascii, 16) + '*\n';
        }
        pos += 16;
    } while (pos < buffer.length);
    if (identical > 0) {
        lines += 'Next ' + identical + ' lines are identical.\n'
        identical++;
    }
    return lines;
}

export function getFields(buffer: Buffer) {
    const num = buffer.readUInt32LE(0);
    const mbe: MultifetchElement[] = [];

    for (let i = 0; i < num; i++) {
        const len = buffer.readUInt32LE(4 + i * 16);
        const error = buffer.readUInt32LE(4 + i * 16 + 4);
        const isn = buffer.readUInt32LE(4 + i * 16 + 8);
        mbe.push({ len, error, isn });
    }
    return { num, mbe };
}

