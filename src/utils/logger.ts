import winston from 'winston';
import {config} from '../config/environment';

// Define severity levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Choose level based on environment (more verbose in dev)
const level = config.logging.appState === 'production' ? 'warn' : 'debug';

// Consistent format for logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }), // Log stack traces for errors
  winston.format.splat(),
  winston.format.json() // Output as JSON
);

// Define transports
const transports = [
  // Always log to the console (adjust level for production)
  new winston.transports.Console({
      level: config.logging.appState === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
          winston.format.colorize(), // Add colors for readability in console
          winston.format.simple() // Use simpler format for console
      ),
  }),
  // Log all messages >= 'warn' to an error file
  new winston.transports.File({
    filename: 'src/logs/error.log',
    level: 'warn',
  }),
  // Log everything to a combined file
  new winston.transports.File({ filename: 'src/logs/combined.log' }),
];

// Create the logger instance
const logger = winston.createLogger({
  level: level,
  levels: levels,
  format: logFormat,
  transports: transports,
  exitOnError: false, // Don't crash on logger errors
});

export default logger;