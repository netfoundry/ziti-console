"use strict";

const winston = require("winston");

const formats = {
    json: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.json()
    ),
    text: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.colorize(),
        winston.format.cli()
    )
};

const transports = {
    console: new winston.transports.Console({}),
};

const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.json(),
    defaultMeta: {service: 'ziti-console'},
    transports: [
        transports.console
    ]
});


const mod = {
    setFormat: (format) => {
        let newFormat = formats[format];
        if (!newFormat) {
            logger.error("invalid logging format: " + format);
            process.exit(1)
        }
        logger.format = newFormat
    },
    logger: logger
};

module.exports = mod;