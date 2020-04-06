'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const BaseStore = require('./base/base-store');
const BaseStoreEngineMemory = require('./base/base-store-engine-memory');
const BaseStoreEngineMongodb = require('./base/base-store-engine-mongodb');
const factories = require('./util/factories');

module.exports = {
  createPersistantStore: factories.createPersistantStore,
  createMemoryStore: factories.createMemoryStore,
  BaseStore,
  BaseStoreEngineMemory,
  BaseStoreEngineMongodb
};