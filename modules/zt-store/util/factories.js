'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

let BaseStore = require('../base/base-store');
let BaseStoreEngineMemory = require('../base/base-store-engine-memory');
let BaseStoreEngineMongodb = require('../base/base-store-engine-mongodb');

module.exports = {
  createMemoryStore: (collectionName, options) => {
    return new BaseStore(new BaseStoreEngineMemory(collectionName), options);
  },
  createPersistantStore: (db, collectionName, options) => {
    return new BaseStore(new BaseStoreEngineMongodb(db, collectionName), options);
  },
};