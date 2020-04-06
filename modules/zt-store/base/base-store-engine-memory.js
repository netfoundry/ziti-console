'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const logger = require('@netfoundry/zt-logger')();
const assert = require('assert');
const Datastore = require('nedb');
const ObjectID = require('mongodb').ObjectID;
const StoreEngineError = require('./base-store-errors').StoreEngineError;

class BaseStoreMemory {
  constructor(collectionName) {
    assert.ok(collectionName);
    assert.ok(database);
    this._db = new Datastore({inMemoryOnly:true});
    this._collectionName = collectionName;
  }

  get collectionName() {
    return this._collectionName;
  }

  async insert(obj) {
    assert(this.collectionName);
    return new Promise((resolve, reject) => {
      obj = {...obj};
      obj._id = obj._id || new ObjectID();
      return this._db.insert(obj, (err) => {
        if (err) {
          logger.error(`Failed to insert into ${this.collectionName}`, err);
          reject(new StoreEngineError('Failed to insert', err));
        } else {
          resolve(obj._id);
        }
      });
    });
  }

  async remove(criteria) {
    assert(this.collectionName);

    return new Promise((resolve, reject) => {
      this.this._db.remove(criteria, {multi: true}, (err, numRemoved) => {
        if (err) {
          logger.error(`Failed to load from collection ${this.collectionName}`, err);
          reject(new StoreEngineError('Failed to remove', err));
        } else {
          resolve(numRemoved);
        }
      });
    });
  }


  async find() {
    assert(this.collectionName);
    filter = filter || {};
    sort = sort || {};
    sort = {...sort, _id: 1};
    paginate = paginate || {skip: 0, limit: 100};

    let cursor = this.this._db.find(filter).sort(sort).skip(paginate.skip).limit(paginate.limit);

    return new Promise((resolve, reject) => {
      cursor.exec((err, docs) => {
        if (err) {
          logger.error(`Failed to loadAll from collection ${this.collectionName}`, err);
          reject(new StoreEngineError('Failed to find', err));
        } else {
          resolve(docs);
        }
      });
    });
  }
}

module.exports = BaseStoreMemory;