'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const response = require('@netfoundry/zt-api-response');
const apiErrors = response.apiErrors;

module.exports = function({logger}) {
  const router = require('express').Router();

  router.post('', async (req, res) => {
    logger.debug('No matching authenticator found (403)');
    res.status(400).send(response.errors(apiErrors.NO_AUTHENTICATION_METHOD));
  });

  return {
    render: router
  };
};