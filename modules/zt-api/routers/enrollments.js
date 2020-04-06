'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const express = require('express');
const fs = require('fs');
const genericEndpoints = require("../generic-endpoints");
const resp = require('@netfoundry/zt-api-response');
const assert = require('assert');
const external = require('request');
const nodemailer = require("nodemailer");
const crypto = require('@netfoundry/zt-crypto');


const ENTITY_NAME = 'enrollments';

module.exports = function ({middleware, middlewareFactories, validate, model, versions, logger, externalHost, enrollment: enrollmentConfig}) {
  let router = express.Router();
  let enrollmentsStore = model[ENTITY_NAME].store;
  let evStore = model['email-verifications'].store;

  let outputFilter = (obj)=>validate(obj, 'enrollments.get');
  let updateValidator = (obj)=>validate(obj, 'enrollments.put');

  let activeMiddleware = [middleware.contentTypeIsJson, ...middleware.authorizers];
  let readMiddleware = [...activeMiddleware, middlewareFactories.userHasAllPermissions(`${ENTITY_NAME}.read`)];
  let writeMiddleware = [...activeMiddleware, middlewareFactories.userHasAllPermissions(`${ENTITY_NAME}.write`)];

  router.get(`/${ENTITY_NAME}`, readMiddleware, genericEndpoints.getListOfItems(enrollmentsStore, logger, {outputFilter}));
  router.get(`/${ENTITY_NAME}/:id`, readMiddleware, genericEndpoints.getItem(enrollmentsStore, 'id', 'id', logger));
  router.put(`/${ENTITY_NAME}/:id`, writeMiddleware, genericEndpoints.updateItem(enrollmentsStore, 'id', 'id', logger, {updateValidator}));
  router.delete(`/${ENTITY_NAME}/:id`, writeMiddleware, async function (req, res) {
    try {
      let criteria = {};
      criteria.id = req.params.id;

      let enrollment = await enrollmentsStore.findById(req.params.id);

      if(!enrollment){
        res.status(404).json(resp.error(resp.apiErrors.NOT_FOUND));
        return
      }

      await enrollmentsStore.removeOne(criteria);
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

      let enrollment = req.body;

      const result = validate(enrollment, 'enrollments.post');

      if (!result.isValid) {
        res.status(400).json(resp.errors(result.errors));
        return;
      }

      enrollment.id = enrollmentsStore.generateId();
      enrollment.isEmailVerified = false;
      enrollment.isIdentityCreated = false;
      enrollment.jwt = "";

      await enrollmentsStore.insertOne(enrollment);


      let encryptedEmailAddress = await crypto.encrypt(model, enrollment.email);

      let emailVerification = {};
      emailVerification.id = evStore.generateId();
      emailVerification.enrollmentId = enrollment.id;
      emailVerification.secret = encryptedEmailAddress;
      emailVerification.email = enrollment.email;

      await evStore.insertOne(emailVerification);

      let doEmail = true;  // TEMP

      if (doEmail) {

        let transporter = nodemailer.createTransport({
          host: "email-smtp.us-east-1.amazonaws.com",
          port: 465,
          secure: true,
          auth: {
            user: process.env.AWS_SES_USER,
            pass: process.env.AWS_SES_PASSWORD
          }
        });
      
        var emailContentFile = __dirname+"/../../../html/email-verification-email.html";
        var content = fs.readFileSync(emailContentFile, 'utf8');

        logger.info("externalHost is: %o", externalHost);

        content = content.replace(/\$enrollmentHost/g, externalHost.enrollment.hostname);
        content = content.replace(/\$zacHost/g, externalHost.zac.hostname);
        content = content.replace(/\$secret/g, emailVerification.secret);


        let info = await transporter.sendMail({
          from: '"MattermoZt" <no-reply@netfoundry.io>',
          to: enrollment.email,
          subject: "MattermoZt Email Verification ✔", // Subject line
          text: "Hello", // plain text body
          html: content // html body
        });
      
        logger.info("Email sent: %s", info.messageId);

      }
        
      let location = `/${ENTITY_NAME}/${enrollment.id}`;
      res.status(200).append('Location', location).json(resp.success({id: enrollment.id}, {location}));

    } catch (err) {
      logger.error(err);
      res.status(500).json(resp.error(err));
    }
  });

  return router;
};