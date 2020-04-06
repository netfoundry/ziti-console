'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */
const logger = require('@netfoundry/zt-logger')();
const apiErrors = require('./errors');

/*
{
  "keyword": "required",
  "dataPath": "",
  "schemaPath": "#/required",
  "params": {
  "missingProperty": "name"
},
  "message": "should have required property 'name'"
}
*/

function isJsonSchemaError(err) {
  return err && err.hasOwnProperty('keyword') && err.hasOwnProperty('dataPath') && err.hasOwnProperty('schemaPath') && err.hasOwnProperty('message');
}

function convertSingleJsonSchemaError(err) {
  if (err.keyword === 'required') {
    let newErr = {code: 'PROPERTY_REQUIRED', property: err.params.missingProperty, msg: err.message};
    newErr.details = err;
    logger.debug('Converted error to: ', newErr);
    return newErr;
  } else if (err.dataPath) {
    let property = err.dataPath.replace(/^\./, '');
    let newErr = {code: 'PROPERTY_INVALID', property, msg: err.message};
    newErr.details = err;
    logger.debug('Converted error to: ', newErr);
    return newErr;
  } else {
    return err;
  }
}

function convertJsonSchemaErrors(errors) {
  logger.debug('Converting error from: ', errors);
  if (errors instanceof Array) {
    if (errors.length === 1) {
      return [convertSingleJsonSchemaError(errors[0])];
    }

    let anyOf = errors.find(err => err.keyword === 'anyOf' || err.keyword === 'oneOf');
    if (anyOf) {
      let property = anyOf.dataPath.replace(/^\./, '');
      return [{
        code: 'PROPERTY_INVALID',
        property,
        msg: `The field "${property}" is invalid or missing`,
        details: errors
      }];
    } else {
      return errors.map(err => convertSingleJsonSchemaError(err));
    }
  } else {
    return convertSingleJsonSchemaError(errors);
  }
}

function errors(errors, meta) {
  meta = meta || {};
  if (!Array.isArray(errors)) {
    errors = [errors];
  }

  if (isJsonSchemaError(errors[0])) {
    return {
      meta,
      errors: convertJsonSchemaErrors(errors)

    }
  }

  errors = errors.map((err) => {
    if (err instanceof Error) {
      let newError = {
        code: apiErrors.UNSPECIFIED.code,
        msg: err.message
      };

      if (err.innerError) {
        newError.innerError = {
          code: apiErrors.UNSPECIFIED.code,
          msg: err.innerError.message
        }
      }

      return newError;
    }
    return err;
  });

  return {
    meta: meta,
    errors: errors
  }
}

module.exports = {
  success: function (data, meta) {
    data = data || {};
    meta = meta || {};
    return {
      meta: meta,
      data: data
    }
  },
  error: function (error, meta) {
    error = error || apiErrors.UNSPECIFIED;
    return errors(error, meta)
  },
  errors: errors,
  apiErrors,
  convertJsonSchemaErrors
};