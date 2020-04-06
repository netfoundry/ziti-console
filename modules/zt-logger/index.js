'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const bunyan = require('bunyan');
const path = require('path');
const readPkgUp = require('read-pkg-up');
const parentModule = require('parent-module');

let logger = null;

module.exports = function(config) {
  config = config || {};

  if(logger) {
    if(config.name) {
      config.subName = config.name;
      delete config.name;
    }
    return logger.child(config, false);
  } else {
    let parent = parentModule();
    config.name = config.name || readPkgUp.sync({cwd: path.dirname(parent)}).pkg.name;
    logger = bunyan.createLogger(config);
    return logger;
  }
};