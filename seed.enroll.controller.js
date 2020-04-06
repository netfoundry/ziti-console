'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const yargs = require('yargs');
const fs = require('fs');

const ENV_PREFIX = 'ZITI_EDGE_';

const usageMsg = '\nSeed a Ziti Edge controller persistant store with the defualt MongoDb implementation.' +
  `\n\nParameters can be specified in order of precedence: command line, config file, environment variable (prefix option name with ${ENV_PREFIX}).` +
  '\n\nUsage: $0 -c <jsonConfig>' +
  '\nUsage: $0 -u <mongoDbConnectString>';

let argv = yargs
  .env(ENV_PREFIX)
  .strict()
  .usage(usageMsg)
  .config()
  .alias('config', 'c')
  .alias('help', 'h')
  .option('url', {
    alias: ['u'],
    describe: 'A MongoDb connection URL',
    type: 'string',
  })
  .option('fixture-path', {
    alias: ['f'],
    describe: 'A path to *.json files where the file name is a model identity',
    type: 'string',
  })
  .option('dbname', {
    alias: ['n'],
    describe: 'The name of the mongo db to use',
    default: 'zac',
    type: 'string'
  })
  .option('destroy', {
    alias: ['d'],
    describe: 'Whether to destroy existing stored data first',
    default: true,
    type: 'booolean'
  })
  .option('logLevel', {
    alias: ['l'],
    default: 'info',
    choices: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
    describe: 'The log level to set. Overrides verbose.',
    type: 'choice'
  })
  .option('values', {
    alias: ['v'],
    describe: 'Key value pairs to replace within fixture files. KEY=VALUE format. (e.g. -v KEY1=SomeValue). May be specified many times or supply many values with one flag.',
    type: 'array'
  })
  .option('pretty', {
    alias: ['p'],
    describe: 'Turns on a pretty printing log format for stderr/stdout',
    type: 'boolean'
  })
  .coerce('values', (argv)=>{
    let values = {};
     argv.forEach((keyValueStr)=>{
       let keyValueArray =  keyValueStr.split('=',2);
       values[keyValueArray[0]] = keyValueArray[1];
     });
     return values;
  })
  .demand(['url', 'fixture-path'], `Please supply required parameters via command line, config file, environment variables, or a mixture of the methods.\n\nPrefix environment variables with ${ENV_PREFIX}*. For example: ${ENV_PREFIX}clientSecret`)
  .check((argv)=>{
    return fs.lstatSync(argv.f).isDirectory();
  })
  .argv;

let loggerConfig = {
  level: argv.logLevel,
  streams: [],
  src: false,
};


if(argv.pretty) {
  let PrettyStream = require('bunyan-prettystream');
  let prettyStdOut = new PrettyStream();
  prettyStdOut.pipe(process.stdout);
  loggerConfig.streams.push({
    level: loggerConfig.level,
    type: 'raw',
    stream: prettyStdOut
  });
} else {
  loggerConfig.streams.push({
    level: loggerConfig.level,
    stream: process.stdout
  });
}

const logger = require('@netfoundry/zt-logger')(loggerConfig);
const model = require('@netfoundry/zt-store-model');

async function go() {
  try{
    await model.initialize(argv.url, argv.dbname);
    await model.seedFromDirectory(argv['fixture-path'], {replaceValues: argv.values, destroyFirst:argv.destroy});
  } catch(err) {
    throw err;
  }
}

logger.info('Starting seeding');

go().then(()=>{
  logger.info('Done');
  process.exit(0);
}).catch(err=>{
  logger.error(err);
  process.exit(1);
});