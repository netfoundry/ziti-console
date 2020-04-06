'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const logger = require('@netfoundry/zt-logger')();
const ztHttpListner = require('@netfoundry/zt-http-listener');
const fs = require('fs');


module.exports = async ({apiHttpListener, externalPki, internalPki, internalHttpListener, mongoDb, externalHost, internalHost}) => {
  const app = require('@netfoundry/zt-api-app')();
  const storeModel = require('@netfoundry/zt-store-model');
  logger.info("mongoDb.url is: %s", mongoDb.url);
  await storeModel.initialize(mongoDb.url, mongoDb.dbName);
  const model = storeModel.model;

  let authBusConfig = {
    authenticators: [
      require('@netfoundry/zt-authenticator-updb')({model})
    ]
  };

  //Register Middleware
  require('@netfoundry/zt-api-authenticator-bus')(app, authBusConfig);

  app.use(require('@netfoundry/zt-api-req-session-loader')(model).handler);

  require('@netfoundry/zt-api')({
    app,
    authorizers: [require('@netfoundry/zt-authorizer-authenticated')()],
    model,
    externalHost,
  });

  app.addDefaultHandlers();

  return ztHttpListner(apiHttpListener, app);
};

