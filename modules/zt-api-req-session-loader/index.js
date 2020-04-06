'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const logger = require('@netfoundry/zt-logger')();

module.exports = function (model) {
  return {
    handler: async (req, res, next) => {
      req.session = null;
      try {
        let sessionToken = req.get('zt-session') || req.cookies['ZT_AUTHENTICATION'];
        req.session = null;
        if (sessionToken) {
          let session = await model.sessions.store.findOne({token: sessionToken}, {allowAllFields: true});
          if (session) {
            req.session = session;
          }
        }
        next();
      } catch (err) {
        logger.error(err);
        next();
      }
    }
  };
};