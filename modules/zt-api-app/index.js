'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const logger = require('@netfoundry/zt-logger')();
const express = require('express');
const response = require('@netfoundry/zt-api-response');
const generalErrors = response.apiErrors;
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const pj = require('./package.json');

// noinspection JSUnusedLocalSymbols
function defaultErrorHandler(err, req, res, next) {
  if(err.type === "entity.parse.failed") {
    res.status(400).json(response.error(generalErrors.COULD_NOT_PARSE_REQUEST));
  } else if(err.type === "route.not.found") {
    res.status(404).json(response.error(generalErrors.ROUTE_NOT_FOUND));
  } else {
    logger.error('An unknown error has occurred.');
    logger.error(err);
    res.status(500).json(response.error());
  }
}

module.exports = function() {
  let app = express();

  var corsOptions = {

    // Configure the Access-Control-Allow-Origin CORS header to reflect
    // the request origin defined by incoming req.header('Origin')
    origin: true,

    // Some legacy browsers (IE11, various SmartTVs) choke on 204, so let's return 200
    optionsSuccessStatus: 200,

    // Configures the Access-Control-Allow-Headers CORS header.
    // Expects a comma-delimited string (ex: 'Content-Type,Authorization') or an array
    // (ex: ['Content-Type', 'Authorization']). If not specified, defaults to reflecting
    // the headers specified in the request's Access-Control-Request-Headers header.
    allowedHeaders: ['Content-Type', 'Accept', 'zt-session'],

    // Configures the Access-Control-Allow-Credentials CORS header.
    // Set to true to pass the header, otherwise it is omitted.
    credentials: true
  };

  // Enable pre-flight across-the-board
  app.options('*', cors(corsOptions));

  // Enable all CORS requests
  app.use(cors(corsOptions));

  // Add some security-related headers, e.g.:
  //  X-Content-Type-Options: nosniff
  //  X-DNS-Prefetch-Control: off
  //  X-Download-Options: noopen
  //  X-Frame-Options: SAMEORIGIN
  //  X-XSS-Protection: 1; mode=block
  app.use(helmet());

  // Config the X-Powered-By header so it's NOT "Express", but instead, reflects who we are
  app.use(helmet.hidePoweredBy({ setTo: pj.name + ' v' + pj.version }));

  //app.use(require('morgan')('tiny'));
  app.use(require('cookie-parser')());
  app.use(bodyParser.json());
  app.use(bodyParser.text());

  app.addDefaultHandlers = () => {
    app.all('*', (req, res, next) => {
      let err = new Error('No route found');
      err.type = 'route.not.found';
      err.status = 404;
      next(err);
    });

    app.use(defaultErrorHandler);
  };
  return app;
};
