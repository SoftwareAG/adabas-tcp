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

import { ControlBlock } from './control-block';

const messages: any = {
    3: {
        text: 'An end-of-file or end-of-list condition was detected.'
    },
    17: {
        text: 'Invalid file number.',
        sub: {


            2: 'Unauthorized system file access.',
            4: 'The file number was equal to 0 or greater than the maximum value allowed.',
            5: 'The file was not loaded.',
            6: 'File to be created already exists.',
            8: 'An ET user with a restricted file list and ACC = file number attempted to issue a UPD command, or a user with a restricted file list attempted to touch a file that is not in the file list.',
            14: 'A LOB file was accessed instead of the associated base file.',
            16: ' The file was locked by ADAOPR.',
            21: 'A 2-byte file number was used against a lower version database that does not support large file numbers.',
            22: 'Invalid (corrupted) FCB.'
        }
    },
    34: {
        text: 'An invalid command option has been detected.'
    },
    41: {
        text: 'An error was detected in the format buffer.',
        sub: {
            1: 'An invalid command option has been specified in one of the command option fields.',
            2: 'The R option has been specified for the C5 command, but replication is not active.',
            9: 'A record buffer must be specified for this command but is missing (not specified of length zero).'
        }
    },
    48: {
        text: 'The requested database operation is not allowed.',
        sub: {
            2: 'The requested usage of the specified file conflicts with the current usage of the file by another user or Adabas utility.',
            8: 'The user ID provided in the OP command is already assigned to another user.',
            11: 'A non-privileged user issued an OP command to a nucleus that is in "Utilities only" status.',
            17: 'The data of a specified file is not accessible. This can happen if a utility aborts or an autorestart fails.',
            18: 'The index of the specified file is not accessible. This can happen if a utility aborts or if the index has been disabled by ADAREC REGENERATE or an autorestart'
        }
    },
    55: {
        text: 'Format, length conversion or truncation error occurred while processing field values in the record buffer or value buffer.',
        sub: {
            0: 'Conversion error.',
            1: 'Truncation error.',
            2: 'Internal structure error.',
            5: 'Internal error.',
            20: 'Unsupported DATETIME conversion.',
            21: 'Date/time value outside valid range. The valid range depends on the date-time edit masks being used in the format or search buffer and the FDT.',
            22: 'Date/time value specified in gap when switching from standard time to daylight saving time.',
            24: 'Month not between 1 and 12.',
            25: 'Day not between 1 and n, where n is the number of days of the month specified.',
            26: 'Hours not between 0 and 24.',
            27: 'Minutes not between 0 and 59.',
            28: 'Seconds not between 0 and 59.',
            30: 'Internal error: missing time zone element for conversion with time zone.',
            31: 'Invalid daylight saving offset given (fldD) for date/time and time zone.'
        }
    },
    60: {
        text: 'A syntax error was detected in the search buffer.'
    },
    61: {
        text: 'An error was detected in the search buffer, value buffer, or during an S8 command.',
        sub: {
            2: 'An invalid value operator was detected in the search buffer.',
            3: 'An invalid logical operator was specified for an S8 command - Command Option 2.',
            7: 'Subcode 7. See documentation for reasons.',
            8: 'An invalid FROM-TO range was specified. The BUT-NOT value was outside the range of the preceding FROM-TO value.',
            9: 'An invalid search criteria was specified.'
        }
    },
    98: {
        text: 'Uniqueness violation of unique descriptor detected during store/update if subtransactions are not activated, or otherwise at end of subtransaction.'
    },
    146: {
        text: 'An invalid buffer length was detected by the Adabas interface routine, in an MC call.'
    }
}

export class AdabasMessage {
    getMessage(cb: ControlBlock): any {
        const message = 'Adabas response code ' + cb.rsp + ' received.';
        let explanation = 'not available';
        if (messages[cb.rsp]) {
            explanation = messages[cb.rsp].text;
            let sub = 0;
            const buf = Buffer.from(cb.add2);
            sub = buf.readInt16LE(2);
            if (messages[cb.rsp].sub && messages[cb.rsp].sub[sub]) explanation += ' ' + messages[cb.rsp].sub[sub];
        }
        return { message, explanation };
    }
}
