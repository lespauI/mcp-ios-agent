/**
 * Logger class for standardized application logging
 */
export class Logger {
  constructor(private context: string) {}

  info(message: string, data?: Record<string, any>): void {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: Record<string, any>): void {
    this.log('WARN', message, data);
  }

  error(message: string, data?: Record<string, any>): void {
    this.log('ERROR', message, data);
  }

  debug(message: string, data?: Record<string, any>): void {
    this.log('DEBUG', message, data);
  }

  private log(level: string, message: string, data?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const logData = data ? ` ${JSON.stringify(data)}` : '';
    console.log(`[${timestamp}] [${level}] [${this.context}] ${message}${logData}`);
  }
} 