'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

function match(req, res, next) {
  if(req.query.method === 'password') {
    next();
  } else {
    next('skip');
  }
}

module.exports = {
  match: match
};