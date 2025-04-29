import * as winston from 'winston';
import { AsyncLocalStorage } from 'async_hooks';

// 创建 AsyncLocalStorage 实例来存储上下文
const contextStorage = new AsyncLocalStorage();

class LoggerContext {
    constructor() {
        this.startTime = Date.now();
        this.markers = new Map();
    }

    mark(name) {
        this.markers.set(name, Date.now());
    }

    getDuration(from = 'start') {
        const fromTime = from === 'start' ? this.startTime : this.markers.get(from);
        if (!fromTime) return null;
        return Date.now() - fromTime;
    }

    getFormattedDuration(from = 'start') {
        const duration = this.getDuration(from);
        return duration != null ? `[${duration}ms]` : '';
    }
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.timestamp({format: "YYYY-MM-DD HH:mm:ss.SSS"}),
        winston.format.align(),
        winston.format.printf(({ timestamp, level, message, stack }) => {
            const store = contextStorage.getStore();
            const context = store ? Object.fromEntries(store) : {};
            const loggerContext = context.loggerContext;
            const duration = loggerContext ? loggerContext.getFormattedDuration() : '';
            
            let contextStr = Object.entries(context)
                .filter(([key]) => key !== 'loggerContext')
                .map(([_, value]) => value)
                .join('|');
            
            if (contextStr || duration) {
                contextStr = `[${contextStr}${contextStr && duration ? '|' : ''}${duration.replace(/[\[\]]/g, '')}]`;
            }
            
            return stack 
              ? `${timestamp} [${level}] ${contextStr}: ${message?.trim()}\n${stack}` 
              : `${timestamp} [${level}] ${contextStr}: ${message?.trim()}`;
          })
    ),
    transports: [
        new winston.transports.Console(),
    ]
});

export function putContext(context) {
    const store = contextStorage.getStore() || new Map();
    // 初始化日志上下文
    store.set('loggerContext', new LoggerContext());
    for (const [key, value] of Object.entries(context)) {
        store.set(key, value);
    }
    contextStorage.enterWith(store);
}

export function markTime(name) {
    const store = contextStorage.getStore();
    if (store) {
        const loggerContext = store.get('loggerContext');
        if (loggerContext) {
            loggerContext.mark(name);
        }
    }
}

export function getDuration(from = 'start') {
    const store = contextStorage.getStore();
    if (store) {
        const loggerContext = store.get('loggerContext');
        if (loggerContext) {
            return loggerContext.getDuration(from);
        }
    }
    return null;
}

export function removeContext(key) {
    const store = contextStorage.getStore() || new Map();
    if (store) {
        store.delete(key);
        contextStorage.enterWith(store);
    }
}

export function clearContext() {
    contextStorage.enterWith(new Map());
}

export function info(message, meta) {
    logger.info(message, meta);
}

export function error(message, meta) {
    logger.error(message, meta);
}

export function warn(message, meta) {
    logger.warn(message, meta);
}

export function debug(message, meta) {
    logger.debug(message, meta);
}

