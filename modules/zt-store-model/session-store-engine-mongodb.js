'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const {BaseStoreEngineMongodb} = require('@netfoundry/zt-store');
const assert = require('assert');

class SessionStoreEngineMongoDb extends BaseStoreEngineMongodb{
  constructor(db, collectionName, ttl){
    super(db, collectionName, ttl)
  }

  async findByClusterId(clusterId){
    assert.ok(clusterId);
    let networkSessions = [];
    let docs = await this._db.collection(this.collectionName).aggregate([
      {'$match': {'networkSessions.service.clusters': clusterId}},
      {'$unwind': '$networkSessions'},
      {'$match': {'networkSessions.service.clusters': clusterId}}
    ]).toArray();

    docs.forEach((doc) => {
      networkSessions = networkSessions.concat(doc.networkSessions);
    });
    return networkSessions;
  }
}

module.exports =  SessionStoreEngineMongoDb;