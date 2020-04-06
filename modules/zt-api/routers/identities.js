'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const express = require('express');
const genericEndpoints = require("../generic-endpoints");
const resp = require('@netfoundry/zt-api-response');
const uuidv4 = require('uuid/v4');
const jsonwebtoken = require('jsonwebtoken');
const assert = require('assert');

const ENTITY_NAME = 'identities';
const ENROLLMENT_METHOD_OTT = 'ott';
const ENROLLMENT_METHOD_OTT_CA = 'ottca';

module.exports = function ({middleware, middlewareFactories, validate, model, versions, logger, externalHost, enrollment: enrollmentConfig}) {
  let router = express.Router();
  let identitiesStore = model[ENTITY_NAME].store;
  // let caStore = model['cas'].store;

  let outputFilter = (obj)=>validate(obj, 'identities.get');
  let updateValidator = (obj)=>validate(obj, 'identities.put');

  let activeMiddleware = [middleware.contentTypeIsJson, ...middleware.authorizers];
  let readMiddleware = [...activeMiddleware, middlewareFactories.userHasAllPermissions(`${ENTITY_NAME}.read`)];
  let writeMiddleware = [...activeMiddleware, middlewareFactories.userHasAllPermissions(`${ENTITY_NAME}.write`)];

  router.get(`/${ENTITY_NAME}`, readMiddleware, genericEndpoints.getListOfItems(identitiesStore, logger, {outputFilter}));
  router.get(`/${ENTITY_NAME}/:id`, readMiddleware, genericEndpoints.getItem(identitiesStore, 'id', 'id', logger));
  router.put(`/${ENTITY_NAME}/:id`, writeMiddleware, genericEndpoints.updateItem(identitiesStore, 'id', 'id', logger, {updateValidator}));
  router.delete(`/${ENTITY_NAME}/:id`, writeMiddleware, async function (req, res) {
    try {
      let criteria = {};
      criteria.id = req.params.id;

      let identity = await identitiesStore.findById(req.params.id);

      if(!identity){
        res.status(404).json(resp.error(resp.apiErrors.NOT_FOUND));
        return
      }

      if(identity.isDefaultAdmin){
        res.status(400).json(resp.error({
          code: 'CANNOT_DELETE_DEFAULT_ADMIN',
          msg: 'The default admin cannot be removed from the system'
        }));
      }
      await identitiesStore.removeOne(criteria);
      res.status(200).json(resp.success());

    } catch (err) {
      logger.error(err);
      res.status(500).json(resp.error(err));
    }
  });

  router.post(`/${ENTITY_NAME}`, writeMiddleware, async function (req, res) {
    try {
      assert.ok(req);
      assert.ok(res);

      let identity = req.body;

      const result = validate(identity, 'identities.post');

      if (!result.isValid) {
        res.status(400).json(resp.errors(result.errors));
        return;
      }

      identity.isDefaultAdmin = false;
      identity.authenticators = {};
      let enrollment = identity.enrollment;
      identity.enrollment = {};
      identity.id = identitiesStore.generateId(); //pregenerate to use in jwt

      await identitiesStore.insertOne(identity);
      let location = `/${ENTITY_NAME}/${identity.id}`;
      res.status(200).append('Location', location).json(resp.success({id: identity.id}, {location}));
    } catch (err) {
      logger.error(err);
      res.status(500).json(resp.error(err));
    }
  });

  return router;
};