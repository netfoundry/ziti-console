'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

module.exports = {
  UNSUPPORTED_MEDIA_TYPE: {code: 'UNSUPPORTED_MEDIA_TYPE', msg: 'Unsupported media type'},
  COULD_NOT_PARSE_REQUEST: {
    code: 'COULD_NOT_PARSE_REQUEST',
    msg: 'The request body could not be parsed; please check its syntax'
  },
  ROUTE_NOT_FOUND: {
    code: 'ROUTE_NOT_FOUND',
    msg: 'No endpoint could be found that supports the path and method specified'
  },
  UNSPECIFIED: {code: 'UNSPECIFIED', msg: 'An unspecified error has occurred'},
  INVALID_SESSION: {code: 'INVALID_SESSION', msg: 'This request requires a valid session'},
  INSUFFICIENT_ACCESS: {
    code: 'INSUFFICIENT_ACCESS',
    msg: 'The current session does not have access to this capability'
  },
  INVALID_ID_SUPPLIED: {code: 'INVALID_ID_SUPPLIED', msg: 'Could complete the operation, the id supplied is not valid or no longer available'},
  ENTITY_ALREADY_ASSIGNED: {code: 'ENTITY_ALREADY_ASSIGNED', msg: 'Could not assign item, it is already assigned'},
  INVALID_AUTHENTICATION: {code: 'INVALID_AUTHENTICATION', msg: 'Authentication failed, due to a credential issue'},
  NO_AUTHENTICATION_METHOD: {code: 'NO_AUTHENTICATION_METHOD', msg: 'The authentication method is not available or is invalid'},
  NO_ROUTABLE_INGRESS_NODE: {code: 'NO_ROUTABLE_INGRESS_NODES', msg: 'No ingress nodes are availble'},
  NOT_FOUND: {code: 'NOT_FOUND', msg: 'The item requested does not exist'},
  FABRIC_UNREACHABLE: {code: 'FABRIC_UNREACHABLE', msg: 'The downstream fabric could not be managed'}
};

