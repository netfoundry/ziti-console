'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const response = require('@netfoundry/zt-api-response');
const assert = require('assert');
const q2m = require('query-to-mongo');
const deepExtend = require('deep-extend');
const urljoin = require('urljoin');

module.exports = {
  getListOfItems(store, logger, {outputFilter, findFunc} = {}) {

    assert.ok(store);
    assert.ok(logger);

    return async function (req, res) {
      try {
        let parsedQuery = q2m(req.query);

        let filter = parsedQuery.criteria;
        let sort = parsedQuery.options.sort;
        let paginate = {skip: parsedQuery.options.skip, limit: parsedQuery.options.limit};


        let items = null;

        if(findFunc) {
          items = await findFunc(req, res, {filter, sort, paginate, allowAllFields: true})
        } else {
          items = await store.find({filter, sort, paginate, allowAllFields: true});
        }

        if (outputFilter) {
          items.forEach((item) => outputFilter(item))
        }

        res.status(200).json(response.success(items));
      } catch (err) {
        logger.error(err);
        res.status(500).json(response.error(err));
      }
    };
  },
  getItem(store, reqParamName, storeParamName, logger, {outputFilter} = {}) {
    assert.ok(store);
    assert.ok(reqParamName);
    assert.ok(storeParamName);
    assert.ok(logger);

    return async function (req, res) {
      try {

        let criteria = {};
        criteria[storeParamName] = req.params[reqParamName];

        let item = await store.findOne(criteria);

        if (!item) {
          res.status(404).json(response.error(response.apiErrors.NOT_FOUND));
          return
        }

        if (outputFilter) {
          outputFilter(item);
        }

        res.status(200).json(response.success(item));
      } catch (err) {
        logger.error(err);
        res.status(500).json(response.error(err));
      }
    };
  },
  deleteItem(store, reqParamName, storeParamName, logger) {
    assert.ok(store);
    assert.ok(reqParamName);
    assert.ok(storeParamName);

    return async function (req, res) {
      try {
        let criteria = {};
        criteria[storeParamName] = req.params[reqParamName];

        let numRemoved = await store.removeOne(criteria);

        if (numRemoved === 0) {
          res.status(404).json(response.error(new Error('The id specified does not exist')));
          return;
        }
        res.status(200).json(response.success());

      } catch (err) {
        logger.error(err);
        res.status(500).json(response.error(err));
      }
    };
  },
  createItem(store, logger, {inputValidator, beforeValidate, beforeInsert} = {}) {
    assert.ok(store);
    assert.ok(logger);

    return async function (req, res) {
      try {
        let obj = req.body;

        if (beforeValidate) {
          beforeValidate(req, res, obj)
        }

        if (inputValidator) {
          const result = inputValidator(obj);

          if (!result.isValid) {
            res.status(400).json(response.errors(result.errors));
            return;
          }
        }

        if (beforeInsert) {
          beforeInsert(req, res, obj)
        }

        await store.insertOne(obj);
        let location = urljoin(req.originalUrl, obj.id);
        res.status(200).append('Location', location).json(response.success({id: obj.id}, {location}));
      } catch (err) {
        logger.error(err);
        res.status(500).json(response.error(err));
      }
    }
  },
  updateItem(store, reqParamName, storeParamName, logger, {updateValidator, beforeUpdate} = {}) {
    assert.ok(store);
    assert.ok(reqParamName);
    assert.ok(storeParamName);
    assert.ok(logger);

    return async function (req, res) {
      try {
        let obj = req.body;
        if (updateValidator) {

          const result = updateValidator(obj);

          if (!result.isValid) {
            res.status(400).json(response.errors(result.errors));
            return;
          }
        }

        let criteria = {};
        criteria[storeParamName] = req.params[reqParamName];

        let item = await store.findOne(criteria);

        if (!item) {
          res.status(404).json(response.error(response.apiErrors.NOT_FOUND));
          return;
        }

        obj = {...item, ...obj};

        if (beforeUpdate) {
          beforeUpdate(req, res, obj)
        }

        await store.updateById(obj);
        res.status(200).json(response.success());
      } catch (err) {
        logger.error(err);
        res.status(500).json(response.error(err));
      }
    }
  },
  patchItem(store, reqParamName, storeParamName, logger, {inputValidator, beforePatch} = {}) {
    assert.ok(store);
    assert.ok(reqParamName);
    assert.ok(storeParamName);
    assert.ok(logger);

    return async function (req, res) {
      try {
        let obj = req.body;
        if (inputValidator) {

          const result = inputValidator(obj);

          if (!result.isValid) {
            res.status(400).json(response.errors(result.errors));
            return;
          }
        }

        let criteria = {};
        criteria[storeParamName] = req.params[reqParamName];

        let item = await store.findOne(criteria);

        if (!item) {
          res.status(404).json(response.error(response.apiErrors.NOT_FOUND));
          return
        }

        obj = deepExtend(item, obj);

        if (beforePatch) {
          beforePatch(req, res, obj)
        }

        await store.insertOne(obj);
        res.status(200).json(response.success());
      } catch (err) {
        logger.error(err);
        res.status(500).json(response.error(err));
      }
    }
  },
  getSubListOfItems(store, reqIdParam, storeIdProp, storeSubProp, logger, {outputFilter} = {}) {
    assert.ok(store);
    assert.ok(reqIdParam);
    assert.ok(storeIdProp);
    assert.ok(storeSubProp);
    assert.ok(logger);


    return async function (req, res) {
      try {
        let parsedQuery = q2m(req.query);

        let filter = parsedQuery.criteria;
        let sort = parsedQuery.options.sort;
        let paginate = {skip: parsedQuery.options.skip, limit: parsedQuery.options.limit};

        let mainDocCriteria = {[storeIdProp]: req.params[reqIdParam]};

        let items = await store.findArraySubDocuments(mainDocCriteria, storeSubProp, {filter, sort, paginate});

        if (outputFilter) {
          items.forEach((item) => outputFilter(item))
        }

        res.status(200).json(response.success(items));
      } catch (err) {
        logger.error(err);
        res.status(500).json(response.error(err));
      }
    };
  },
  getSubItem(store, reqIdParam, storeIdProp, storeSubProp, reqSubIdParam, storeSubIdProp, logger, {outputFilter} = {}) {
    assert.ok(store);
    assert.ok(reqIdParam);
    assert.ok(storeIdProp);
    assert.ok(storeSubProp);
    assert.ok(reqSubIdParam);
    assert.ok(storeSubIdProp);
    assert.ok(logger);

    return async function (req, res) {
      try {

        let mainDocCriteria = {
          [storeIdProp]: req.params[reqIdParam]
        };

        let item = await store.findArraySubDocumentById(mainDocCriteria, storeSubProp, storeSubIdProp, req.params[reqSubIdParam]);

        if (!item) {
          res.status(404).json(response.error(response.apiErrors.NOT_FOUND));
          return
        }

        if (outputFilter) {
          outputFilter(item);
        }

        res.status(200).json(response.success(item));
      } catch (err) {
        logger.error(err);
        res.status(500).json(response.error(err));
      }
    };
  },
  deleteSubItem(store, reqIdParam, storeIdProp, storeSubProp, reqSubIdParam, storeSubIdProp, logger) {
    assert.ok(store);
    assert.ok(reqIdParam);
    assert.ok(storeIdProp);
    assert.ok(storeSubProp);
    assert.ok(reqSubIdParam);
    assert.ok(storeSubIdProp);
    assert.ok(logger);

    return async function (req, res) {
      try {
        let mainDocCriteria = {
          [storeIdProp]: req.params[reqIdParam]
        };

        let subDocCritiera = {
          [storeSubIdProp]: req.params[reqSubIdParam]
        };

        let numRemoved = await store.removeArraySubDocument(mainDocCriteria, storeSubProp, subDocCritiera);

        if (numRemoved === 0) {
          res.status(404).json(response.error(new Error('The id specified does not exist')));
          return;
        }
        res.status(200).json(response.success());

      } catch (err) {
        logger.error(err);
        res.status(500).json(response.error(err));
      }
    };
  },
  createSubItem(store, reqIdParam, storeIdProp, storeSubProp, logger, {inputValidator, beforeInsert} = {}) {
    assert.ok(store);
    assert.ok(reqIdParam);
    assert.ok(storeIdProp);
    assert.ok(storeSubProp);
    assert.ok(logger);

    return async function (req, res) {
      try {
        let obj = req.body;
        if (inputValidator) {
          const result = inputValidator(obj);

          if (!result.isValid) {
            res.status(400).json(response.errors(result.errors));
            return;
          }
        }

        if (beforeInsert) {
          beforeInsert(req, res, obj)
        }

        let mainDocCriteria = {
          [storeIdProp]: req.params[reqIdParam]
        };

        await store.insertArraySubDocument(mainDocCriteria, storeSubProp, obj);
        let location = urljoin(req.originalUrl, obj.id);
        res.status(200).append('Location', location).json(response.success({id: obj.id}, {location}));
      } catch (err) {
        logger.error(err);
        res.status(500).json(response.error(err));
      }
    }
  },
  getListOfArrayJoinedSubItems(localStore, localIdProperty, foreignCollectionName, foreignIdProperty, foreignIdReqParram, foreignArrayProperty, logger, {outputFilter} = {}) {
    assert.ok(localStore);
    assert.ok(localIdProperty);
    assert.ok(foreignCollectionName);
    assert.ok(foreignIdProperty);
    assert.ok(foreignIdReqParram);
    assert.ok(foreignArrayProperty);
    assert.ok(logger);

    return async function (req, res) {
      try {
        let parsedQuery = q2m(req.query);

        let filter = parsedQuery.criteria;
        let sort = parsedQuery.options.sort;
        let paginate = {skip: parsedQuery.options.skip, limit: parsedQuery.options.limit};

        let foreignId = req.params[foreignIdReqParram];
        let options = {filter, sort, paginate};
        let items = await localStore.findFilterByIdArraySubDocument(localIdProperty, foreignCollectionName, foreignIdProperty, foreignId, foreignArrayProperty, options);

        if (outputFilter) {
          items.forEach((item) => outputFilter(item))
        }

        res.status(200).json(response.success(items));
      } catch (err) {
        logger.error(err);
        res.status(500).json(response.error(err));
      }
    };
  },
  addArrayJoinedSubItem(store, joinedStore, idReqParam, idProperty, arrayProperty, joinedIdProperty, logger, {} = {}) {
    assert.ok(store);
    assert.ok(joinedStore);
    assert.ok(idReqParam);
    assert.ok(idProperty);
    assert.ok(arrayProperty);
    assert.ok(joinedIdProperty);
    assert.ok(logger);

    return async function (req, res) {
      try {
        let obj = req.body;

        let item = await store.findById(req.params[idReqParam]);

        if (!item) {
          res.status(404).json(response.error(response.apiErrors.NOT_FOUND));
          return
        }

        let joinedItem = await joinedStore.findById(obj.id);

        if (!joinedItem) {
          res.status(400).json(response.error(response.apiErrors.INVALID_ID_SUPPLIED));
          return
        }

        item[arrayProperty] = item[arrayProperty] || [];

        if(item[arrayProperty].includes(joinedItem[joinedIdProperty])){
          res.status(409).json(response.error(response.apiErrors.ENTITY_ALREADY_ASSIGNED));
          return
        }

        item[arrayProperty].push(joinedItem[joinedIdProperty]);

        await store.updateById(item);
        res.status(200).json(response.success());
      } catch (err) {
        logger.error(err);
        res.status(500).json(response.error(err));
      }
    };
  },
  deleteAllJoinedSubItems(store, idReqParam, arrayProperty, logger) {
    assert.ok(store);
    assert.ok(idReqParam);
    assert.ok(arrayProperty);
    assert.ok(logger);
 
    return async function (req, res) {
      try {

        let item = await store.findById(req.params[idReqParam]);

        if (!item) {
          res.status(404).json(response.error(response.apiErrors.NOT_FOUND))
        }

        item[arrayProperty] = [];

        await store.updateById(item);
        res.status(200).json(response.success());
      } catch (err) {
        logger.error(err);
        res.status(500).json(response.error(err));
      }
    };
  },
  deleteJoinedSubItem(store, idReqParam, idProperty, arrayProperty, joinedIdReqParam, logger, {} = {}) {
    assert.ok(store);
    assert.ok(idReqParam);
    assert.ok(idProperty);
    assert.ok(arrayProperty);
    assert.ok(joinedIdReqParam);
    assert.ok(logger);

    return async function (req, res) {
      try {
        let item = await store.findById(req.params[idReqParam]);

        if (!item) {
          res.status(404).json(response.error(response.apiErrors.NOT_FOUND));
          return
        }

        let index = item[arrayProperty].indexOf(req.params[joinedIdReqParam]);

        if(index >= 0) {
          item[arrayProperty].splice(index,1);
          await store.updateById(item);
          res.status(200).json(response.success());
        } else {
          res.status(404).json(response.error(response.apiErrors.NOT_FOUND))
        }

      } catch (err) {
        logger.error(err);
        res.status(500).json(response.error(err));
      }
    };
  },
};