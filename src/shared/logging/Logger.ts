/**
 * Logger interface
 */
export interface ILogger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: Error | any, meta?: any): void;
  fatal(message: string, error?: Error | any, meta?: any): void;
  setLevel?(level: LogLevel | string): void;
}

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
  SILENT = 5
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  name?: string;
  timestamp?: boolean;
  colorize?: boolean;
  json?: boolean;
  prettyPrint?: boolean;
  destination?: LogDestination;
}

/**
 * Log destination
 */
export type LogDestination = 'console' | 'file' | 'both';

/**
 * Log entry
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  logger: string;
  message: string;
  meta?: any;
  error?: Error;
}

/**
 * Console logger implementation
 */
export class ConsoleLogger implements ILogger {
  private config: LoggerConfig;
  private name: string;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      timestamp: true,
      colorize: true,
      json: false,
      prettyPrint: true,
      destination: 'console',
      ...config
    };
    this.name = config.name || 'App';
  }

  debug(message: string, meta?: any): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  info(message: string, meta?: any): void {
    this.log(LogLevel.INFO, message, meta);
  }

  warn(message: string, meta?: any): void {
    this.log(LogLevel.WARN, message, meta);
  }

  error(message: string, error?: Error | any, meta?: any): void {
    this.log(LogLevel.ERROR, message, meta, error);
  }

  fatal(message: string, error?: Error | any, meta?: any): void {
    this.log(LogLevel.FATAL, message, meta, error);
  }

  setLevel(level: LogLevel | string): void {
    if (typeof level === 'string') {
      const levelValue = LogLevel[level.toUpperCase() as keyof typeof LogLevel];
      if (levelValue !== undefined) {
        this.config.level = levelValue;
      }
    } else {
      this.config.level = level;
    }
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, meta?: any, error?: Error): void {
    if (level < this.config.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      logger: this.name,
      message,
      meta,
      error
    };

    if (this.config.json) {
      this.logJson(entry);
    } else {
      this.logPretty(entry);
    }
  }

  /**
   * Log in JSON format
   */
  private logJson(entry: LogEntry): void {
    const output = {
      timestamp: entry.timestamp.toISOString(),
      level: LogLevel[entry.level],
      logger: entry.logger,
      message: entry.message,
      ...(entry.meta && { meta: entry.meta }),
      ...(entry.error && { 
        error: {
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack
        }
      })
    };

    console.log(JSON.stringify(output));
  }

  /**
   * Log in pretty format
   */
  private logPretty(entry: LogEntry): void {
    const parts: string[] = [];

    // Timestamp
    if (this.config.timestamp) {
      parts.push(`[${entry.timestamp.toISOString()}]`);
    }

    // Level
    const levelStr = this.getLevelString(entry.level);
    parts.push(levelStr);

    // Logger name
    parts.push(`[${entry.logger}]`);

    // Message
    parts.push(entry.message);

    // Log to console
    const logMethod = this.getConsoleMethod(entry.level);
    logMethod(parts.join(' '));

    // Log metadata if present
    if (entry.meta && this.config.prettyPrint) {
      console.log('  Meta:', entry.meta);
    }

    // Log error if present
    if (entry.error) {
      console.error('  Error:', entry.error.message);
      if (entry.error.stack && entry.level >= LogLevel.ERROR) {
        console.error('  Stack:', entry.error.stack);
      }
    }
  }

  /**
   * Get level string with color
   */
  private getLevelString(level: LogLevel): string {
    const levelName = LogLevel[level];
    
    if (!this.config.colorize) {
      return `[${levelName}]`;
    }

    // ANSI color codes
    const colors = {
      [LogLevel.DEBUG]: '\x1b[36m', // Cyan
      [LogLevel.INFO]: '\x1b[32m',  // Green
      [LogLevel.WARN]: '\x1b[33m',  // Yellow
      [LogLevel.ERROR]: '\x1b[31m', // Red
      [LogLevel.FATAL]: '\x1b[35m'  // Magenta
    };

    const reset = '\x1b[0m';
    return `${colors[level]}[${levelName}]${reset}`;
  }

  /**
   * Get console method for level
   */
  private getConsoleMethod(level: LogLevel): (...args: any[]) => void {
    switch (level) {
      case LogLevel.DEBUG:
        return console.debug;
      case LogLevel.INFO:
        return console.info;
      case LogLevel.WARN:
        return console.warn;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        return console.error;
      default:
        return console.log;
    }
  }
}

/**
 * Logger factory
 */
export class LoggerFactory {
  private static loggers: Map<string, ILogger> = new Map();
  private static defaultConfig: Partial<LoggerConfig> = {
    level: LogLevel.INFO,
    timestamp: true,
    colorize: true
  };

  /**
   * Create or get logger
   */
  static getLogger(name: string, config?: Partial<LoggerConfig>): ILogger {
    const key = name || 'default';
    
    if (!this.loggers.has(key)) {
      const loggerConfig = {
        ...this.defaultConfig,
        ...config,
        name
      };
      this.loggers.set(key, new ConsoleLogger(loggerConfig));
    }
    
    return this.loggers.get(key)!;
  }

  /**
   * Set default configuration
   */
  static setDefaultConfig(config: Partial<LoggerConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
  }

  /**
   * Clear all loggers
   */
  static clear(): void {
    this.loggers.clear();
  }
}

/**
 * Create child logger
 */
export function createChildLogger(parent: ILogger, name: string): ILogger {
  if (parent instanceof ConsoleLogger) {
    const parentName = (parent as any).name;
    return LoggerFactory.getLogger(`${parentName}.${name}`);
  }
  return parent;
}

/**
 * Default logger instance
 */
export const logger = LoggerFactory.getLogger('App');

/**
 * Type alias for backward compatibility
 */
export type Logger = ILogger;