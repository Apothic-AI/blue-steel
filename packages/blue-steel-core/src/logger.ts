import pino from 'pino';

export const logger = pino({
    level: process.env.BLUE_STEEL_LOG_LEVEL || 'warn',
    transport: process.stdout.isTTY ? {
        target: 'pino-pretty',
        options: {
            colorize: !process.env.NO_COLOR,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname'
        }
    } : undefined
}).child({
    name: "agent"
});

export default logger;
