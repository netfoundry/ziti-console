'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const logger = require('@netfoundry/zt-logger')();
const defaultRoute = require('./default-route')({logger});

function authenticatorErrorHandler(err, req, res, next) {
  if(err === 'skip') {
    next();
  } else {
    next(err);
  }
}

module.exports = function(app, config) {
  logger.info('Adding authentication methods');
  for(let i = 0; i < config.authenticators.length; i++) {
    let authenticator = config.authenticators[i];
    let render = authenticator.render;
    render.use(authenticatorErrorHandler);
    app.use('/authenticate', render);
  }

  app.use('/authenticate', defaultRoute.render);
};
