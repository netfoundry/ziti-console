'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const http = require('http');
const https = require('https');
const fs = require('fs');

const logger = require('@netfoundry/zt-logger')();

module.exports = function(config, handler) {
  let server = null;
  let protocols = null;

  if(config.endpoint.ssl) {
    protocols = {https: {port: config.endpoint.port}};
    let options = Object.assign({}, {requestCert: true, rejectUnauthorized: false}, config.endpoint.ssl);

    if(!options.key || !options.cert) {
      throw new Error('key and cert must be supplied for an HTTPS server');
    }

    options.key = fs.readFileSync(config.endpoint.ssl.key);
    options.cert = fs.readFileSync(config.endpoint.ssl.cert);

    if(options.ca) {
      options.ca = fs.readFileSync(config.endpoint.ssl.ca);
    }

    server = https.createServer(options, (req, res, next) => {
      logger.info('Enrollment HTTPS listener is handling a request', req.method, req.url);
      try {
        handler(req, res, next);
      } catch(err) {
        logger.error(err);
      }
    });

  } else {
    protocols = {http: {port: config.endpoint.port}};
    server = http.createServer((req, res, next) => {
      logger.info('Enrollment HTTP listener is handling a request', req.url);
      try {
        handler(req, res, next);
      } catch(err) {
        logger.error(err);
      }});
  }
  return {
    listen: () => {
      server.listen(config.endpoint.port, () => {
        logger.info('Started Enrollment HTTP listener on port: ', config.endpoint.port);
        logger.trace('Started Enrollment HTTP listener with config', config.endpoint)
      });
    },
    server,
    getProtocols: () => {
      return protocols;
    }
  };
};
