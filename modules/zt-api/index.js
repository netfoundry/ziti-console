'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const logger = require('@netfoundry/zt-logger')();
const express = require('express');
const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');
const response = require('@netfoundry/zt-api-response');
const generalErrors = response.apiErrors;
const objectPath = require('object-path');


const versions = {
  api: '1.0.0',
  enrollmentApi: '1.0.0',
};

function validateObj(ajv, obj, schemaName) {
  let isValid = ajv.validate(schemaName, obj);
  let errors = ajv.errors;
  let errorText = ajv.errorsText();
  return {
    isValid,
    errors,
    errorText,
  };
}

function contentTypeIsJson(req, res, next) {
  if((req.method === "POST" || req.method === 'PUT' || req.method === 'PATCH') && !req.is('application/json')) {
    res.status(415).json(response.error(generalErrors.UNSUPPORTED_MEDIA_TYPE));
  } else {
    next();
  }
}

function contentTypeIsText(req, res, next) {
  if((req.method === "POST" || req.method === 'PUT' || req.method === 'PATCH') && !req.is('text/plain')) {
    res.status(415).json(response.error(generalErrors.UNSUPPORTED_MEDIA_TYPE));
  } else {
    next();
  }
}

function userIsDefaultAdmin(req, res, next){
  if(req.session && req.session.authenticators && req.session.authenticators[0] && req.session.authenticators[0].identity.isDefaultAdmin){
    logger.info(`user is default admin`);
    next();
  } else {
    logger.info(`user is NOT default admin`);
    res.status(403).json(response.error(generalErrors.INSUFFICIENT_ACCESS));
  }
}

function userHasAnyPermission(...permissions){
  return (req, res, next)=>{
    let identity = objectPath.get(req, 'session.authenticators.0.identity', {});

    if(identity.isAdmin){
      next();
      return;
    }

    let identityPermissions = objectPath.get(identity, 'permissions', []);

    if(permissions.find((perm)=>{
      return identityPermissions.includes(perm);
    })) {
      next();
    } else {
      logger.info(`INSUFFICIENT_ACCESS`);

      res.status(403).json(response.error(generalErrors.INSUFFICIENT_ACCESS));
    }
  };
}

function userHasAllPermissions(...permissions){
  return (req, res, next)=>{
    let identity = objectPath.get(req, 'session.authenticators.0.identity', {});

    // logger.info(`identity is: `, identity);

    // if(identity.isAdmin){
      next();
      return;
    // }

    logger.info(`req.url is: `, req.url);

    if (req.url.indexOf("/email-verifications") === 0) {
      logger.info(`Bypassing permissions check for URL /email-verifications`);
      next();
      return;
    }

    let identityPermissions = objectPath.get(identity, 'permissions', []);

    logger.info(`identityPermissions is: `, identityPermissions);

    if(permissions.every((perm)=>{
      return identityPermissions.includes(perm);
    })) {
      next();
    } else {
      logger.info(`INSUFFICIENT_ACCESS`);

      res.status(403).json(response.error(generalErrors.INSUFFICIENT_ACCESS));
    }
  };
}


module.exports = function ({app, authorizers, model, /* externalCertSigner, certValidator, internalCertValidator, */ externalHost /* , internalHost, enrollment, fabrics */}) {
  let routerPath = path.join(__dirname, "routers");
  let jsonSchemaPath = path.join(__dirname, "json-schema");

  let sessionRouter = express.Router();
  let ajv = new Ajv({removeAdditional: true, useDefaults: true});

  fs.readdirSync(jsonSchemaPath).forEach(function (file) {
    let filePath = './json-schema/' + file;
    let jsonSchema = require(filePath);
    let fileNameWithoutPrefix = path.parse(file).name;
    try{
      ajv.addSchema(jsonSchema, fileNameWithoutPrefix); //i.e. policies.post
    }catch(err){
      logger.error(`Failed to load schema file ${filePath} from root ${__dirname}`);
      throw err;
    }
  });

  fs.readdirSync(routerPath).forEach(function (file) {
    let router = require("./routers/" + file)({
      validate(obj, schema) {
        return validateObj(ajv, obj, schema)
      },
      middleware: {
        authorizers,
        contentTypeIsJson,
        contentTypeIsText,
        userIsDefaultAdmin
      },
      middlewareFactories:{
        userHasAnyPermission,
        userHasAllPermissions
      },
      model,
      logger,
      // externalCertSigner,
      // certValidator,
      // internalCertValidator,
      versions,
      externalHost,
      // internalHost,
      // enrollment,
      // fabrics
    });
    sessionRouter.use(router);
  });

  app.use(sessionRouter);

  // app.use(function(req, res, next) {
  //   // if path does not start with /email-verifications/, then invoke session middleware
  //   if (req.url.indexOf("/email-verifications/") !== 0) {
  //       return sessionHandler(req, res, next);
  //   } else {
  //       next();
  //   }
  // });

};