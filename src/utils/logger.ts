// ══════════════════════════════════════════════════════════════════════════════
// LOGGER — Structuré avec scrubbing PII
// Production : JSON une ligne (compatible Railway / Datadog / Logtail)
// Dev        : texte coloré lisible
// ══════════════════════════════════════════════════════════════════════════════

const isProd = process.env['NODE_ENV'] === 'production';

// Scrub les données sensibles d'un message d'erreur avant log
function sanitizeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === 'string') return err.substring(0, 500);
  if (typeof err === 'object' && err !== null) {
    // Extraire seulement le message métier si présent (pattern service EasyVTC)
    const e = err as Record<string, unknown>;
    if (typeof e['message'] === 'string') return e['message'].substring(0, 500);
    return '[objet non-sérialisable]';
  }
  return String(err).substring(0, 500);
}

// Retirer les patterns PII courants d'une chaîne de log
function redactPii(text: string): string {
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email]')
    .replace(/\+?\d[\d\s\-().]{7,}\d/g, '[phone]')
    .replace(/(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+)/g, '[jwt]')
    .replace(/(Bearer\s+)[^\s"']+/gi, '$1[token]');
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function log(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>): void {
  const safeMessage = redactPii(message);

  if (isProd) {
    const entry: Record<string, unknown> = {
      level,
      ts:      new Date().toISOString(),
      module,
      message: safeMessage,
    };
    if (meta) entry['meta'] = meta;
    process.stdout.write(JSON.stringify(entry) + '\n');
  } else {
    const prefix: Record<LogLevel, string> = {
      info:  '\x1b[36m[INFO]\x1b[0m',
      warn:  '\x1b[33m[WARN]\x1b[0m',
      error: '\x1b[31m[ERROR]\x1b[0m',
      debug: '\x1b[90m[DEBUG]\x1b[0m',
    };
    const base = `${prefix[level]} [${module}] ${safeMessage}`;
    if (meta) console.log(base, meta);
    else      console.log(base);
  }
}

export const logger = {
  info:  (module: string, message: string, meta?: Record<string, unknown>) => log('info',  module, message, meta),
  warn:  (module: string, message: string, meta?: Record<string, unknown>) => log('warn',  module, message, meta),
  error: (module: string, message: string, err?: unknown)                  => log('error', module, message, { err: sanitizeError(err) }),
  debug: (module: string, message: string, meta?: Record<string, unknown>) => {
    if (!isProd) log('debug', module, message, meta);
  },
};
