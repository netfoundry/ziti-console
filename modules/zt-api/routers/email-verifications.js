'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const express = require('express');
const genericEndpoints = require("../generic-endpoints");
const resp = require('@netfoundry/zt-api-response');
const assert = require('assert');
const crypto = require('@netfoundry/zt-crypto');
const logger = require('@netfoundry/zt-logger')();
const fetch = require('node-fetch');


const ENTITY_NAME = 'email-verifications';

module.exports = function ({middleware, middlewareFactories, validate, model, versions, logger, externalHost, enrollment: enrollmentConfig}) {

  let router = express.Router();
  let evStore = model[ENTITY_NAME].store;
  let enrollmentsStore = model["enrollments"].store;

  let outputFilter = (obj)=>validate(obj, 'email-verifications.get');

  let activeMiddleware = [middleware.contentTypeIsJson, ...middleware.authorizers];
  let readMiddleware = [...activeMiddleware, middlewareFactories.userHasAllPermissions(`${ENTITY_NAME}.read`)];
  let writeMiddleware = [...activeMiddleware, middlewareFactories.userHasAllPermissions(`${ENTITY_NAME}.write`)];

  router.get(`/${ENTITY_NAME}`, readMiddleware, genericEndpoints.getListOfItems(evStore, logger, {outputFilter}));

  router.post(`/${ENTITY_NAME}`, writeMiddleware, async function (req, res) {
    try {
      assert.ok(req);
      assert.ok(res);

      // Validate the incoming POST body
      let emailVerificationParms = req.body;
      const result = validate(emailVerificationParms, 'email-verifications.post');
      if (!result.isValid) {
        res.status(400).json(resp.errors(result.errors));
        return;
      }

      // Find the pending Email Verification record in the database
      let criteria = {};
      criteria.secret = emailVerificationParms.secret;
      let emailVerification = await evStore.findOne(criteria, { allowAllFields: true });
      if (!emailVerification) {
        res.status(404).json(resp.error(resp.apiErrors.NOT_FOUND));
        return
      }

      // Decrypt the incoming secret
      let unEncryptedEmailAddress = await crypto.decrypt(model, emailVerification.secret);

      // if (unEncryptedEmailAddress !== emailVerificationParms.email) {
      //   res.status(404).json(resp.error(resp.apiErrors.NOT_FOUND));
      //   return
      // }

      // Mark the pending enrollment as having had a successful email verification
      let enrollment = await enrollmentsStore.findById(emailVerification.enrollmentId);
      if (!enrollment) {
        res.status(404).json(resp.error(resp.apiErrors.NOT_FOUND));
        return
      }
      enrollment.isEmailVerified = true;
      await enrollmentsStore.updateById(enrollment);

      // Immediately purge the pending email verification record now that the email has been successfully verified
      // (i.e., prevent the user from clicking through again, and possibly confusing the identity creation process)
      await evStore.removeOne(criteria);

      // Initiate the Identity Creation now
      let identityCreationResults = await createIdentity(externalHost, unEncryptedEmailAddress, enrollmentsStore, enrollment);
      logger.error("identityCreationResults is: %o", identityCreationResults);

      if (identityCreationResults.error) {
        res.status(404).json(resp.error(identityCreationResults.error));
        return
      }

      res.status(200).json(resp.success({unEncryptedEmailAddress: unEncryptedEmailAddress}));

    } catch (err) {

      logger.error(err);
      res.status(500).json(resp.error(err));

    }
  });

  return router;
};


/**
 * 
 * @param {*} zitiController 
 */
const authenticateWithController = async (zitiController) => {

  const body = {
    "username": "admin",
    "password": "admin"
  }

  try {
    
    const response = await fetch( zitiController + '/authenticate?method=password', {
        method: 'post',
        body:    JSON.stringify(body),
        headers: { 
          'Content-Type': 'application/json' 
        },
    })

    const json = await response.json();

    const cookies = response.headers.raw()['set-cookie'];
    logger.info("cookies: %o", cookies);

    json.cookies = cookies;

    return json;

  } catch (error) {
    return(error);
  }
};

/**
 * 
 * @param {*} zitiController 
 * @param {*} cookies 
 * @param {*} unEncryptedEmailAddress 
 */
const createOTTIdentityWithController = async (zitiController, cookies, unEncryptedEmailAddress) => {

  let identityName = "@mm-" + unEncryptedEmailAddress;

  const body = {
    "name": identityName,
    "type": "User",
    "isAdmin": false,
    "enrollment": {
      "ott": true
    }
  }

  const headers = {
    'Content-Type': 'application/json'
  }
  cookies.forEach(function (cookie) {
    headers["Cookie"] = cookie;
  });

  try {
    
    const response = await fetch( zitiController + '/identities', {
        method: 'post',
        body:    JSON.stringify(body),
        headers: headers
    })

    const json = await response.json();

    return json;

  } catch (error) {
    return(error);
  }
};

/**
 * 
 * @param {*} zitiController 
 * @param {*} cookies 
 * @param {*} identityId 
 */
const fetchJWTForIdentityFromController = async (zitiController, cookies, identityId) => {

  const headers = {
    'Content-Type': 'application/json'
  }
  cookies.forEach(function (cookie) {
    headers["Cookie"] = cookie;
  });

  try {
    
    const response = await fetch( zitiController + '/identities/' + identityId, {
        method: 'get',
        headers: headers
    })

    const json = await response.json();

    return json;

  } catch (error) {
    return(error);
  }
};

/**
 * 
 * @param {*} externalHost 
 * @param {*} unEncryptedEmailAddress 
 * @param {*} enrollmentsStore 
 * @param {*} enrollment 
 */
async function createIdentity(externalHost, unEncryptedEmailAddress, enrollmentsStore, enrollment) {

  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;  // disable certificate verification

  let authResults = await authenticateWithController(externalHost.zitiController.hostname);
  logger.info(authResults);

  if (authResults.error) {
    return {error: authResults.error};
  }

  let ottResults = await createOTTIdentityWithController(externalHost.zitiController.hostname, authResults.cookies, unEncryptedEmailAddress);
  logger.info(ottResults);

  if (ottResults.error) {
    return {error: ottResults.error};
  }

  let identityResults = await fetchJWTForIdentityFromController(externalHost.zitiController.hostname, authResults.cookies, ottResults.data.id);
  logger.info(identityResults);

  if (identityResults.error) {
    return {error: identityResults.error};
  }

  try {

    logger.info("enrollment record is currently: %o", enrollment);

    enrollment.isIdentityCreated = true;
    enrollment.jwt = identityResults.data.enrollment.ott.jwt;

    logger.info("enrollment record is now: %o", enrollment);

    await enrollmentsStore.updateById(enrollment);
  
    logger.info("database updated :)");

    return {};
  }
  catch (err) {
    logger.info("err: %o", err);
    return {error: err}
  }

}
