'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const {check, validationResult} = require('express-validator/check');
const crypto = require('crypto');
const response = require('@netfoundry/zt-api-response');
const authErrors = response.apiErrors;

function sha512String(s) {
  let sha = crypto.createHash('sha512');
  sha.update(s);
  return sha.digest('hex');
}

function contentTypeIsJson(req, res, next) {
  if((req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') && !req.is('application/json')) {
    res.status(415).json(response.error(response.apiErrors.UNSUPPORTED_MEDIA_TYPE));
  } else {
    next();
  }
}

module.exports = function({model, matcher, logger}) {

  const router = require('express').Router();

  router.use(matcher);
  router.use(contentTypeIsJson);

  let validators = [check('username').exists(), check('password').exists()];

  router.use('', validators, async (req, res /*, next */) => {

    logger.info("1");

    const errors = validationResult(req);
    if(!errors.isEmpty()) {
      return res.status(400).json(response.errors(errors.array()));
    }

    let username = req.body.username;
    let password = sha512String(req.body.password);

    logger.info("username: ", username);
    logger.info("password: ", password);

    try {
      let identity = await model.identities.store.findOne({'authenticators.updb.username': username, 'authenticators.updb.password':password}, {allowAllFields:true});
      logger.info("2");
      let userFound = !!identity;

      if(userFound && identity.authenticators.updb && identity.authenticators.updb.password === password) {
        logger.debug('User identified by UPDB');
        let authenticator = {
          module: 'zt-authenticator-updb',
          identity,
          principal: {
            username
          }
        };
        let session = await model.sessions.create(authenticator);

        await model.sessions.store.insertOne(session);
        res.set({'zt-session': session.token});
        res.cookie('ZT_AUTHENTICATION', session.token, {
          httpOnly: true, secure: true
        });
        delete session._id;
        delete session.authenticators;
        delete session.id;
        res.send(response.success({session: session}));

        logger.debug('session details.', JSON.stringify(session, null, 2));

      } else {
        logger.debug(`User FAILED to be identified by UPDB. User found: ${userFound} Password match: ${!userFound ? userFound : docs[0].authenticators.updb.password === shaPassword}`);
        res.status(401).json(response.error(authErrors.INVALID_AUTHENTICATION));
      }
    } catch(err) {
      logger.error(err);
      throw(err);
    }
  });

  return {
    render: router
  };
};