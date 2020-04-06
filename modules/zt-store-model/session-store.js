'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const NETWORK_SESSION_SUB_DOC_PROP = 'networkSessions';
const BaseStore = require('@netfoundry/zt-store').BaseStore;

class SessionStore extends BaseStore {
  constructor(sessionStoreEngine, {sortableFields=[], filterableFields=[], ttl=5} = {}) {
    super(sessionStoreEngine, {sortableFields, filterableFields});
  }

  get networkSessionSubDocProperty() {
    return NETWORK_SESSION_SUB_DOC_PROP;
  }

  async insertNetworkSession(id, networkSession) {
    return await this.insertArraySubDocument({id}, this.networkSessionSubDocProperty, networkSession);
  }

  async removeNetworkSession(id, networkSessionToken) {
    return await this.removeArraySubDocument({id}, this.networkSessionSubDocProperty, {token: networkSessionToken});
  }

  async findNetworkSession(id, {filter, sort, paginate}) {
    return await this.findOneArraySubDocument({id}, this.networkSessionSubDocProperty, {filter, sort, paginate})
  }

  async findByClusterId(clusterId) {
    let engine = this.storeEngine;

    return await this.storeEngine.findByClusterId(clusterId);
  }

}

module.exports = SessionStore;
