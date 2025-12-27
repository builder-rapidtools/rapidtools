/**
 * Structured logging for observability
 *
 * Outputs JSON lines with consistent fields.
 */

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  request_id: string;
  key_id?: string;
  route: string;
  method: string;
  status: number;
  latency_ms: number;
  event_hash_prefix?: string;
  error_code?: string;
  message?: string;
}

/**
 * Log a structured entry
 */
export function logRequest(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
}

/**
 * Create a log entry builder
 */
export function createLogContext(requestId: string, method: string, route: string) {
  const startTime = Date.now();

  return {
    requestId,
    method,
    route,
    startTime,
    keyId: undefined as string | undefined,
    eventHashPrefix: undefined as string | undefined,

    setKeyId(keyId: string) {
      this.keyId = keyId;
    },

    setEventHashPrefix(hash: string) {
      // First 16 chars of hash for logging (after sha256: prefix)
      this.eventHashPrefix = hash.substring(7, 23);
    },

    log(status: number, errorCode?: string, message?: string) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        request_id: this.requestId,
        key_id: this.keyId,
        route: this.route,
        method: this.method,
        status,
        latency_ms: Date.now() - this.startTime,
        event_hash_prefix: this.eventHashPrefix,
        error_code: errorCode,
        message,
      };
      logRequest(entry);
    },
  };
}
