import * as path from 'path';
import pino from 'pino';

// ---------------------------------------------------------------------------
// Log level
// ---------------------------------------------------------------------------

const level = (process.env.LOG_LEVEL || process.env.DEBUG_LEVEL || 'info').toLowerCase();

// ---------------------------------------------------------------------------
// Base pino instance — outputs plain JSON; pipe through pino-pretty in CLI:
//   node app.js | pino-pretty
// ---------------------------------------------------------------------------

const baseLogger = pino({ level });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Matches pino's object-payload shape. */
type LogObject = Record<string, unknown>;

/** Union of all valid log level names. */
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Signature accepted by each logger method — mirrors pino's public API. */
type LogFn = (objOrMsg: LogObject | string, msg?: string) => void;

/** Public shape of the logger — fully typed, no `any`. */
interface Logger {
    trace: LogFn;
    debug: LogFn;
    info:  LogFn;
    warn:  LogFn;
    error: LogFn;
    fatal: LogFn;
    child: (bindings: LogObject) => pino.Logger;
    level: string;
    raw:   pino.Logger;
}

// ---------------------------------------------------------------------------
// Optional caller-location enrichment
// ---------------------------------------------------------------------------

function getCallerIfEnabled(): string | undefined {
    return process.env.LOG_CALLER === 'true' ? getCallerLocation() : undefined;
}

function getCallerLocation(): string {
    const stack = new Error().stack;
    if (!stack) return 'unknown';

    for (const line of stack.split('\n').map(l => l.trim()).slice(1)) {
        if (
            line.includes('node:internal') ||
            line.includes('node_modules')  ||
            line.includes('src/logger')    ||
            line.includes('logger.ts')
        ) continue;

        // Frame examples:
        //   at Object.<anonymous> (/path/to/file.js:10:5)
        //   at /path/to/file.js:10:5
        const m = line.match(/\(?(.+?):(\d+):(\d+)\)?$/);
        if (m) return `${path.basename(m[1])}:${m[2]}`;
    }
    return 'unknown';
}

// ---------------------------------------------------------------------------
// Core dispatch — single implementation shared by all level methods
// ---------------------------------------------------------------------------

function makeLogFn(level: LogLevel): LogFn {
    return (objOrMsg: LogObject | string, msg?: string): void => {
        const caller = getCallerIfEnabled();
        const fn     = baseLogger[level].bind(baseLogger);

        if (typeof objOrMsg === 'string') {
            // logger.debug('message')
            if (caller) fn({ caller }, objOrMsg); else fn(objOrMsg);
        } else if (msg !== undefined) {
            // logger.debug({ key: value }, 'message')
            if (caller) fn({ ...objOrMsg, caller }, msg); else fn(objOrMsg, msg);
        } else {
            // logger.debug({ key: value })
            if (caller) fn({ ...objOrMsg, caller }); else fn(objOrMsg);
        }
    };
}

// ---------------------------------------------------------------------------
// Exported logger
// ---------------------------------------------------------------------------

const logger: Logger = {
    trace: makeLogFn('trace'),
    debug: makeLogFn('debug'),
    info:  makeLogFn('info'),
    warn:  makeLogFn('warn'),
    error: makeLogFn('error'),
    fatal: makeLogFn('fatal'),
    child: (bindings: LogObject) => baseLogger.child(bindings),
    level: baseLogger.level,
    raw:   baseLogger,
};

export default logger;
export { logger };