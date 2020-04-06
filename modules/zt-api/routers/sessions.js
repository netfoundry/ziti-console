'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const express = require('express');
const response = require('@netfoundry/zt-api-response');

module.exports = function ({middleware, validate, model, contentTypeIsJson, logger}) {
  let router = express.Router();
  let store = model.sessions.store;
  let activeMiddleware = [middleware.contentTypeIsJson, ...middleware.authorizers];

  router.delete('/current-session', activeMiddleware, async (req, res) => {
    try {
      if (req.session) {
        logger.info('Logging out, removing session: ', req.session.token);
        await store.removeOne({token: req.session.token});
        res.clearCookie('ZT_AUTHENTICATION');
      } else {
        logger.info('Logout with no session');
      }
      res.status(200).json(response.success());
    } catch (err) {
      res.status(500).json(response.error(err));
    }
  });

  router.get('/current-session', async (req, res) => {
    try {
      if (!req.session) {
        res.status(404).json(response.error(response.apiErrors.NOT_FOUND));
        return;
      }
      for(let i in req.session.authenticators) {
        if(req.session.authenticators.hasOwnProperty(i)){
          delete req.session.authenticators[i].identity.authenticators;
          delete req.session.authenticators[i].identity.enrollment;
        }
      }

      res.status(200).json(response.success(req.session));
    } catch (err) {
      logger.error(err);
      res.status(500).json(response.error(err));
    }
  });


  return router;
};