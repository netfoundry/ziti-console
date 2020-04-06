'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const crypto = require('crypto');

module.exports = {
  create() {
    let sha = crypto.createHash('sha256');
    let randomNumber = Math.random().toString();
    sha.update(randomNumber);
    return sha.digest('hex');
  }
};