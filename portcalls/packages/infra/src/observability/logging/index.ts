// Structured logging (§10, §19): JSON lines with correlationId + tenantId.
export interface LogFields { level: 'info' | 'warn' | 'error'; msg: string; correlationId?: string; tenantId?: string; [k: string]: unknown; }

export function logLine(f: LogFields): string {
  return JSON.stringify({ ts: new Date().toISOString(), ...f });
}

export const logger = {
  info: (msg: string, extra: Partial<LogFields> = {}) => console.log(logLine({ level: 'info', msg, ...extra })),
  warn: (msg: string, extra: Partial<LogFields> = {}) => console.warn(logLine({ level: 'warn', msg, ...extra })),
  error: (msg: string, extra: Partial<LogFields> = {}) => console.error(logLine({ level: 'error', msg, ...extra })),
};
