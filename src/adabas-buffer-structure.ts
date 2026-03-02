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

import { AdabasBuffer } from './adabas-buffer';
import logger from './logger';

export type BufferId = 'R' | 'F' | 'I' | 'V' | 'S' | 'M';

export class AdabasBufferStructure {

    private data: AdabasBuffer[] = [];

    newAbd(abd: AdabasBuffer): void {
        this.data.push(abd);
    }


    add(id: BufferId, buffer: Buffer): void {
        this.newAbd(new AdabasBuffer(id, buffer));
    }

    getBuffers(): AdabasBuffer[] {
        return [...this.data];
    }

    getBuffer(type: BufferId): Buffer | null {
        return this.data.find(e => e.abd.id === type)?.buffer ?? null;
    }

    dump(): void {
        for (const e of this.data) {
            logger.debug({ id: e.abd.id, len: e.buffer.length }, 'AdabasBuffer');
        }
    }
}
