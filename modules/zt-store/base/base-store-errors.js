'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

class StoreError extends Error {
  constructor(message, innerError) {
    super();

    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.message = message || 'An unknown store error has occured';
    this.innerError = innerError || null;
  }
}

class StoreEngineError extends StoreError {
  constructor(message, innerError){
    super(message, innerError);
  }
}

module.exports = {
  StoreError,
  StoreEngineError
};