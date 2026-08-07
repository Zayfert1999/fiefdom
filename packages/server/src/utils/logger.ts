// packages/server/src/utils/logger.ts
// 🌟 Простой серверный логгер с временными метками

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const ICONS: Record<LogLevel, string> = {
  info: '📋',
  warn: '⚠️',
  error: '❌',
  debug: '🔍',
};

function log(level: LogLevel, prefix: string, message: string, ...data: unknown[]): void {
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