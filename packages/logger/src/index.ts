/**
 * [INPUT]: 消息和结构化上下文
 * [OUTPUT]: 框架中立 Logger contract 与无副作用 no-op 实现
 * [POS]: @repo/logger 当前唯一公共边界；未来由应用装配真实日志 adapter
 *
 * [PROTOCOL]:
 * 1. 日志字段、级别或 side effect 变化时更新此 Header。
 * 2. 修改后检查本目录 .folder.md；不得让普通日志承担审计事实。
 */

export type LogContext = Record<string, boolean | number | string | null>;

export type Logger = {
  debug(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
};

const ignoreLog = (_message: string, _context?: LogContext): void => undefined;

export const noopLogger: Logger = {
  debug: ignoreLog,
  error: ignoreLog,
  info: ignoreLog,
  warn: ignoreLog,
};
