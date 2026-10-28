// packages/server/src/utils/logger.ts
// 🌟 Простой серверный логгер с временными метками

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const ICONS: Record<LogLevel, string> = {
  info: '📋',
  warn: '⚠️',
  error: '❌',
  debug: '🔍',
};

// 🌟 Уровень логирования: LOG_LEVEL=debug|info|warn|error (по умолчанию info).
// debug (полные payload'ы событий и т.п.) в обычном режиме не печатается.
const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const envLevel = process.env.LOG_LEVEL as LogLevel | undefined;
const MIN_LEVEL: LogLevel = envLevel && envLevel in LEVEL_WEIGHT ? envLevel : 'info';

function log(level: LogLevel, prefix: string, message: string, ...data: unknown[]): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[MIN_LEVEL]) return;
  const timestamp = new Date().toISOString().slice(11, 23);
  const line = `${ICONS[level]} ${timestamp} ${prefix} ${message}`;
  if (level === 'error') console.error(line, ...data);
  else if (level === 'warn') console.warn(line, ...data);
  else console.log(line, ...data);
}

export const logger = {
  info: (prefix: string, msg: string, ...d: unknown[]) => log('info', prefix, msg, ...d),
  warn: (prefix: string, msg: string, ...d: unknown[]) => log('warn', prefix, msg, ...d),
  error: (prefix: string, msg: string, ...d: unknown[]) => log('error', prefix, msg, ...d),
  debug: (prefix: string, msg: string, ...d: unknown[]) => log('debug', prefix, msg, ...d),
};
