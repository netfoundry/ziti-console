'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const response = require('@netfoundry/zt-api-response');
const logger = require('@netfoundry/zt-logger')();
const authorizationErrors = response.apiErrors;

function checkValidSession(req, res, next) {
  // if (req.url.indexOf("/email-verifications") !== 0) {
  //   if(!req.session || !req.session.authenticators) {
  //     res.status(401).json(response.error(authorizationErrors.INVALID_SESSION));
  //   } else {
  //     next();
  //   }
  // } else {
    next();
  // }
}

module.exports = function() {
  return checkValidSession;
};