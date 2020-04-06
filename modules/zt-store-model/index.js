'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const fs = require('fs');
const ztStore = require('@netfoundry/zt-store');
const MongoClient = require('mongodb').MongoClient;
const SessionStore = require('./session-store');
const SessionStoreEngineMongoDb = require('./session-store-engine-mongodb');
const promisify = require('util').promisify;
const path = require('path');
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const assert = require('assert');
const logger = require('@netfoundry/zt-logger')();
const tokenGenerator = require('./token-generator');
const isISODate = require('is-iso-date');
const addrs = require("email-addresses");


const Ajv = require('ajv');

const ENROLLMENTS = 'enrollments';
const EMAIL_VERIFICATIONS = 'email-verifications';
const IDENTITIES = 'identities';
const CRYPTO = 'crypto';
const SESSIONS = 'sessions';

let ajv = new Ajv();

ajv.addKeyword('jsType', {
  schema: true,
  modifying: true,
  errors: true,
  validate: function jsTypeValidate(jsType, data, schema, currentDataPath, parentData, parentDataProperty, rootData) {
    jsTypeValidate.errors = [];

    if (jsType === 'date') {
      if (!isISODate(data) && !(data instanceof Date)) {
        jsTypeValidate.errors.push({
          keyword: 'jsType',
          message: `Value of ${parentDataProperty} must be a string formatted as an ISO date or a Date`,
          params: {
            keyword: 'jsType'
          }
        });
        return false;
      }

      if (data instanceof Date) {
        return true;
      } else if (typeof data === 'string') {
        let newDate = new Date(data);

        if (isNaN(newDate.valueOf())) {
          jsTypeValidate.errors.push({
            keyword: 'jsType',
            message: `Cannot convert "${data}" to Date`,
            params: {
              keyword: 'jsType'
            }
          });
          return false;
        } else {
          parentData[parentDataProperty] = newDate;
          return true;
        }
      }
    } else {
      jsTypeValidate.errors.push({
        keyword: 'jsType',
        message: `Unsupported jsType value "${jsType}" used on ${parentDataProperty}`,
        params: {
          keyword: 'jsType'
        }
      });
      return false;
    }
  }
});

ajv.addKeyword('nfEmail', {
  schema: true,
  modifying: true,
  errors: true,
  validate: function nfEmailValidate(nfEmail, data, schema, currentDataPath, parentData, parentDataProperty, rootData) {
    nfEmailValidate.errors = [];

    logger.info(`data: ${data}`);

    if (nfEmail === 'email') {

      if (typeof data === 'string') {

        let emailObj = addrs.parseOneAddress(data);

        if (emailObj.domain !== 'netfoundry.io') {
          nfEmailValidate.errors.push({
            keyword: 'nfEmail',
            message: `Email address "${data}" is from unsupported domain`,
            params: {
              keyword: 'nfEmail'
            }
          });
          return false;

        }

      }
    } else {
      nfEmailValidate.errors.push({
        keyword: 'nfEmail',
        message: `Unsupported nfEmail value "${nfEmail}" used on ${parentDataProperty}`,
        params: {
          keyword: 'nfEmail'
        }
      });
      return false;
    }
  }
});
  

const jsonSchemasPath = path.join(__dirname, 'json-schema');
fs.readdirSync(jsonSchemasPath).forEach(function (file) {
  let jsonSchema = require('./json-schema/' + file);
  let fileNameWithoutPrefix = path.parse(file).name;
  ajv.addSchema(jsonSchema, fileNameWithoutPrefix);
});

const modelIdentifiers = {
  ENROLLMENTS,
  EMAIL_VERIFICATIONS,
  IDENTITIES,
  CRYPTO,
  SESSIONS,
};


let isInitialized = false;
let model = null;
let client = null;
let db = null;


async function seed(modelIdentifier, entities, {destroyFirst = true} = {}) {
  try {
    assert.ok(modelIdentifier, 'modelIdentifier must be specified');
    assert.ok(entities, 'entities must b specified');

    if (!isInitialized) {
      throw new Error('initialize() must be called first')
    }

    logger.info(`Seeding: ${modelIdentifier}`);
    let model = module.exports.model[modelIdentifier];

    if (!model) {
      throw new Error(`Invalid model identifier "${modelIdentifier}"`);
    }


    if (destroyFirst) {
      logger.info(`Ensuring collection is dropped: ${modelIdentifier}`);
      await  model.store.destroy();
      await model.store.initialize();
    }

    for (const entity of entities) {
      try {
        logger.info(`Inserting entities: ${modelIdentifier}`);
        await model.store.insertOne(entity);
      } catch (err) {
        console.error(JSON.stringify(err, null, 2));
      }
    }
  } catch (err) {
    throw err;
  }
}

async function processFixtureContent(content, replaceValues = {}) {
  let matcher = /\$\{(\w+)\}/g;

  let match = matcher.exec(content);
  while (match) {
    let value = replaceValues[match[1]];
    if (!value) {
      // value = await promptly.prompt(`Please provide a value for: ${match[1]}`);
    }

    content = content.replace(match[0], value);
    match = matcher.exec(content);
  }

  return JSON.parse(content);
}

async function seedFromDirectory(fixturePath, {replaceValues = {}, destroyFirst = true} = {}) {
  try {
    let allFiles = await readdir(fixturePath);
    let filteredFiles = allFiles.filter(unfilterFile => {
      return path.extname(unfilterFile).toLowerCase() === '.json'
    });

    for (const file of filteredFiles) {
      let contents = await readFile(path.join(fixturePath, file), 'UTF-8');
      let modelIdentifier = path.basename(file, '.json');
      let entities = await processFixtureContent(contents, replaceValues);
      await seed(modelIdentifier, entities, {destroyFirst});
    }

  } catch (err) {
    throw err;
  }
}

function validateObj(obj, schemaName) {
  logger.info("schemaName: ", schemaName);
  logger.info("obj: ", obj);
  // @todo errorText is routinely empty
  let isValid = ajv.validate(schemaName, obj);
  let errors = ajv.errors;
  let errorText = ajv.errorsText();
  return {
    isValid,
    errors,
    errorText,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeConnect(mongoUrl) {
  logger.info("mongoUrl is: %s", mongoUrl);
  let connection = null;
  while (connection === null) {
    try {
      connection = await MongoClient.connect(mongoUrl, {useUnifiedTopology: true});
    } catch (err) {
      logger.error('Could not connect to mongo instance, Attempting again in 5 seconds: ', err.message);
      logger.debug(err);
      await sleep(5000);
    }
  }
  return connection;
}

module.exports = {
  ajv,
  modelIdentifiers,
  initialize: async (mongoUrl, dbName) => {
    assert.ok(mongoUrl, 'mongoUrl must be specified');
    assert.ok(dbName, 'dbName must be specified');
    if (isInitialized) {
      throw new Error('Model cannot be initialized twice');
    }
    try {
      client = await safeConnect(mongoUrl);
      db = client.db(dbName);
      isInitialized = true;
    } catch (err) {
      throw err;
    }
  },
  get model() {
    if (!isInitialized) {
      throw new Error('initialize() must be called first')
    }

    if (!model) {
      model = {};

      model[IDENTITIES] = {
        store: ztStore.createPersistantStore(db, IDENTITIES, {
          filterableFields: ['name', 'authenticators.updb.username'],
          uniqueFields: ['authenticators.updb.username', 'authenticators.cert.fingerprint'],
          validate: (obj) => {
            return validateObj(obj, IDENTITIES)
          }
        }),
        create() {
          return {};
        }
      };

      model[ENROLLMENTS] = {
        store: ztStore.createPersistantStore(db, ENROLLMENTS, {
          filterableFields: ['email', 'id'],
          uniqueFields: ['email', 'id'],
          ttl: 60*30, // auto-purge after 1/2 hour
          validate: (obj) => {
            return validateObj(obj, ENROLLMENTS)
          }
        }),
        create() {
          return {};
        }
      };

      model[EMAIL_VERIFICATIONS] = {
        store: ztStore.createPersistantStore(db, EMAIL_VERIFICATIONS, {
          filterableFields: ['id'],
          uniqueFields: ['id'],
          ttl: 60*30, // auto-purge after 1/2 hour
          validate: (obj) => {
            return validateObj(obj, EMAIL_VERIFICATIONS)
          }
        }),
        create() {
          return {};
        }
      };

      model[CRYPTO] = {
        store: ztStore.createPersistantStore(db, CRYPTO, {
          filterableFields: ['key', 'iv'],
          uniqueFields: ['key', 'iv'],
          validate: (obj) => {
            return validateObj(obj, CRYPTO)
          }
        }),
        create() {
          return {};
        }
      };

      model[SESSIONS] = {
        store: new SessionStore(new SessionStoreEngineMongoDb(db, SESSIONS)),
        async validate() {
          return true;
        },
        create(authenticator) {
          return {
            token: tokenGenerator.create(),
            authenticators: [authenticator]
          };
        },
        async validateNetworkSession() {
          return true;
        },
        createNetworkSession(service, clusterUrls) {
          return {
            token: tokenGenerator.create(),
            urls: clusterUrls,
            service
          };
        }
      };
      model[SESSIONS].store._ttl = 60*30; // Flush session after 1/2 hour


    }


    return model;
  },
  seed,
  seedFromDirectory
};
