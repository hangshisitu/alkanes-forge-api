import DateUtil from './DateUtil.js';

/**
 * LoggerUtil provides MDC-like context tracking for logs
 * Similar to Java's Mapped Diagnostic Context (MDC)
 */
class LoggerUtil {
    // Store for context data
    static contextMap = new Map();
    
    // AsyncLocalStorage for Node.js context isolation
    static asyncLocalStorage = null;
    
    // Initialize AsyncLocalStorage if available (Node.js 12.17.0+)
    static async initialize() {
        try {
            // Dynamically import AsyncLocalStorage
            const { AsyncLocalStorage } = await import('async_hooks');
            LoggerUtil.asyncLocalStorage = new AsyncLocalStorage();
            console.log('LoggerUtil: AsyncLocalStorage initialized');
        } catch (error) {
            console.error('LoggerUtil: AsyncLocalStorage not available, falling back to Map-based context');
        }
    }
    
    /**
     * Put a value into the context
     * @param {string} key - The key to store the value under
     * @param {any} value - The value to store
     */
    static put(key, value) {
        if (LoggerUtil.asyncLocalStorage) {
            const store = LoggerUtil.asyncLocalStorage.getStore() || new Map();
            store.set(key, value);
            LoggerUtil.asyncLocalStorage.enterWith(store);
        } else {
            LoggerUtil.contextMap.set(key, value);
        }
    }
    
    /**
     * Get a value from the context
     * @param {string} key - The key to retrieve
     * @returns {any} - The value stored under the key, or undefined if not found
     */
    static get(key) {
        if (LoggerUtil.asyncLocalStorage) {
            const store = LoggerUtil.asyncLocalStorage.getStore();
            return store ? store.get(key) : undefined;
        } else {
            return LoggerUtil.contextMap.get(key);
        }
    }
    
    /**
     * Remove a value from the context
     * @param {string} key - The key to remove
     */
    static remove(key) {
        if (LoggerUtil.asyncLocalStorage) {
            const store = LoggerUtil.asyncLocalStorage.getStore();
            if (store) {
                store.delete(key);
            }
        } else {
            LoggerUtil.contextMap.delete(key);
        }
    }
    
    /**
     * Clear all context values
     */
    static clear() {
        if (LoggerUtil.asyncLocalStorage) {
            LoggerUtil.asyncLocalStorage.enterWith(new Map());
        } else {
            LoggerUtil.contextMap.clear();
        }
    }
    
    /**
     * Get all context values as an object
     * @returns {Object} - An object containing all context key-value pairs
     */
    static getContext() {
        if (LoggerUtil.asyncLocalStorage) {
            const store = LoggerUtil.asyncLocalStorage.getStore();
            return store ? Object.fromEntries(store) : {};
        } else {
            return Object.fromEntries(LoggerUtil.contextMap);
        }
    }
    
    /**
     * Run a function with a specific context
     * @param {Object} context - The context object with key-value pairs
     * @param {Function} fn - The function to run with the context
     * @returns {any} - The result of the function
     */
    static withContext(context, fn) {
        if (LoggerUtil.asyncLocalStorage) {
            return LoggerUtil.asyncLocalStorage.run(new Map(Object.entries(context)), fn);
        } else {
            // Save current context
            const oldContext = new Map(LoggerUtil.contextMap);
            
            // Set new context
            LoggerUtil.clear();
            for (const [key, value] of Object.entries(context)) {
                LoggerUtil.put(key, value);
            }
            
            try {
                // Run the function
                return fn();
            } finally {
                // Restore old context
                LoggerUtil.clear();
                for (const [key, value] of oldContext) {
                    LoggerUtil.put(key, value);
                }
            }
        }
    }
    
    /**
     * Format log message with context
     * @param {string} level - Log level (info, error, etc.)
     * @param {Array} args - Arguments to log
     * @returns {string} - Formatted log message with context
     */
    static formatLogMessage(level, args) {
        const timestamp = DateUtil.now();
        const context = LoggerUtil.getContext();
        const contextStr = Object.keys(context).length > 0 
            ? ` [${Object.entries(context).map(([k, v]) => `${k}=${v}`).join(', ')}]` 
            : '';
        
        return `[${timestamp}] [${level.toUpperCase()}]${contextStr} ${args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : arg
        ).join(' ')}`;
    }
}

// Initialize the logger
LoggerUtil.initialize();

export default LoggerUtil; 