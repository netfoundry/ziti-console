'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const logger = require('@netfoundry/zt-logger')();


module.exports = function({model}) {
  const matcher = require('./matcher').match;
  const router = require('./router')({model, matcher, logger});

  return {
    render: router.render
  };
};