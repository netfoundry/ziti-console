'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const util = require('./util/crypto');

module.exports = {
  encrypt: util.encrypt,
  decrypt: util.decrypt
};