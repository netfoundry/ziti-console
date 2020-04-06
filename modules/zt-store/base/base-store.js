'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const EventEmitter = require('events');
const assert = require('assert');
const StoreError = require('./base-store-errors').StoreError;
const deepFilter = require('deep-filter');
const uuidv1 = require('uuid/v1');
const logger = require('@netfoundry/zt-logger')();

const ID_PROP = 'id';
const CREATED_AT_PROP = 'createdAt';
const UPDATED_AT_PROP = 'updatedAt';
const TAG_SUB_DOC_PROP = 'tags';
const TTL_PROP = 'ttl';

const PAGINATE_ITEM_LIMIT = 100;
const PAGINATE_ITEM_MIN = 1;

const PAGINATE_ITEM_SKIP_MIN = 0;

const ALLOWED_PROPERTIES = [
  ID_PROP,
  TAG_SUB_DOC_PROP
];

const CRITERIA_OPERATORS = [
  '$all',
  '$and',
  '$bitsAllClear',
  '$bitsAllSet',
  '$bitsAnyClear',
  '$bitsAnySet',
  '$comment',
  '$elemMatch',
  '$eq',
  '$exists',
  '$expr',
  '$geoIntersects',
  '$geoWithin',
  '$gt',
  '$gte',
  '$in',
  '$jsonSchema',
  '$lt',
  '$lte',
  '$mod',
  '$ne',
  '$near',
  '$nearSphere',
  '$nin',
  '$nor',
  '$not',
  '$or',
  '$regex',
  '$size',
  '$text',
  '$type',
  '$where'];


class BaseStore extends EventEmitter {
  get ALTERED_EVENT() {
    return 'altered';
  }

  set ALTERED_EVENT(value) {

  }


  constructor(storeEngine, {
    sortableFields = [], filterableFields = [], validate = () => {
      return {isValid: true}
    }, uniqueFields = [], ttl = undefined
  } = {}) {
    super();
    assert.ok(storeEngine);
    this._storeEngine = storeEngine;

    this._sortableFields = sortableFields || [];
    this._sortableFields = [...sortableFields, ...ALLOWED_PROPERTIES];

    this._filterableFields = filterableFields || [];
    this._filterableFields = [...filterableFields, ...ALLOWED_PROPERTIES];

    this._validate = validate;

    this._uniqueFields = uniqueFields;

    if (!this._uniqueFields.includes(this.idProperty)) {
      this._uniqueFields.push(this.idProperty);
    }

    this._ttl = ttl;

  }

  get ttlProperty() {
    return TTL_PROP;
  }

  get idProperty() {
    return ID_PROP;
  }

  get storeEngine() {
    return this._storeEngine;
  }

  get createdAtProperty() {
    return CREATED_AT_PROP
  }

  get updatedAtProperty() {
    return UPDATED_AT_PROP
  }

  get tagSubDocProperty() {
    return TAG_SUB_DOC_PROP;
  }

  validate(obj) {
    if (!this._validate) {
      this._validate = (() => {
        return {isValid: true, errors: null, errorText: null}
      });
    }
    return this._validate(obj);
  }

  generateId() {
    return uuidv1();
  }

  async destroy() {
    return await this.storeEngine.destroy();
  }

  async initialize() {
    logger.info(`entered`);
    return await this.storeEngine.initialize({uniqueFields: this._uniqueFields, ttl: this._ttl});
  }

  safeEmit(eventName, ...args) {
    try {
      this.emit(eventName, ...args);
    } catch (err) {
      logger.error(`Error in event handler ${eventName}`, err);
    }
  }

  async insertOne(obj) {

    logger.info(`obj: `, obj);

    assert.ok(obj);
    try {
      obj[ID_PROP] = obj[ID_PROP] || this.generateId();
      obj[this.createdAtProperty] = obj[this.createdAtProperty] || new Date();
      obj[this.updatedAtProperty] = obj[this.updatedAtProperty] || new Date();
      obj[this.tagSubDocProperty] = obj[this.tagSubDocProperty] || {};

      let validateResult = this.validate(obj);
      if (!validateResult.isValid) {
        let err = new Error(validateResult.errorText);
        err.result = validateResult;
        throw err;
      }

      let result = await this.storeEngine.insertOne(obj);
      this.safeEmit(BaseStore.ALTERED_EVENT, 'insert', obj);
      this.safeEmit(`insert-${this.storeEngine.collectionName}`, {mainDoc: obj});
      return result;
    } catch (err) {
      logger.error(err);
      throw new StoreError('Insert failed', err);
    }
  }

  async removeOne(criteria) {
    try {
      let mainDoc = await this.storeEngine.findOne(criteria);
      if (mainDoc) {
        let result = await this.storeEngine.removeOne(criteria);
        this.safeEmit(BaseStore.ALTERED_EVENT, 'removeOne');
        this.safeEmit(`remove-${this.storeEngine.collectionName}`, {mainDoc});
        return result;
      }
      return 0;
    } catch (err) {
      throw new StoreError('Remove failed', err);
    }
  }

  async findById(id) {
    let filter = {};
    filter[this.idProperty] = id;
    return this.findOne(filter);
  }

  async find(options) {
    let {filter, sort, paginate, returnAllDocs} = this.sanitizeFindArgs(options);

    try {
      let result = await this.storeEngine.find({filter, sort, paginate, returnAllDocs});
      return result;
    } catch (err) {
      throw new StoreError('Find failed', err);
    }
  }

  async findOne(filter, {allowAllFields = false} = {}) {
    let criteria = this.sanitizeFindArgs({filter, allowAllFields});
    logger.info("findOne() criteria is: %o", criteria);
    if (Object.keys(criteria.filter).length === 0) {
      logger.warn('Attempting to findOne with zero filter criteria! Returning null');
      return null;
    }

    return await this.storeEngine.findOne(criteria.filter);
  }

  async updateById(obj, {allowAllFields = false} = {}) {
    let filter = {};
    filter[this.idProperty] = obj[this.idProperty];
    try {
      obj[this.updatedAtProperty] = new Date();
      let result = await this.storeEngine.updateOne(filter, obj);
      this.safeEmit(BaseStore.ALTERED_EVENT, 'updateById', obj.id);
      this.safeEmit(`update-${this.storeEngine.collectionName}`, {mainDoc: obj});
      return result;
    } catch (err) {
      throw new StoreError('Update failed', err);
    }
  }

  async insertArraySubDocument(mainDocCriteria, subDocProperty, subDoc) {
    try {
      subDoc[this.idProperty] = subDoc[this.idProperty] || this.generateId();
      subDoc[this.createdAtProperty] = subDoc[this.createdAtProperty] || new Date();
      let result = await this.storeEngine.insertArraySubDocument(mainDocCriteria, subDocProperty, subDoc);

      let mainDoc = this.storeEngine.findOne(mainDocCriteria, {allowAllFields: true});
      this.safeEmit(`insert-${this.storeEngine.collectionName}-${subDocProperty}`, {mainDoc, subDoc});
      return result;
    } catch (err) {
      throw new StoreError('subDoc insert failed', err);
    }
  }

  async removeArraySubDocument(mainDocCriteria, subDocProperty, subDocCriteria) {
    try {
      let mainDoc = await this.storeEngine.findOne(mainDocCriteria, {allowAllFields: true});
      let subDocs = await this.storeEngine.findOneArraySubDocument(mainDocCriteria, subDocProperty, {
        filter: subDocCriteria,
        sort: {},
        paginate: {skip: 0, limit: 1}
      });

      let result = await this.storeEngine.removeArraySubDocument(mainDocCriteria, subDocProperty, subDocCriteria);
      this.safeEmit(`remove-${this.storeEngine.collectionName}-${subDocProperty}`, {mainDoc, subDocs});
      return result;
    } catch (err) {
      throw new StoreError('subDoc remove failed', err);
    }
  }

  async removeSubDocumentFromAll(subDocProperty, subDocCriteria) {
    try {
      let result = await this.storeEngine.removeArraySubDocument({}, subDocProperty, subDocCriteria, {multi: true});
      return result;
    } catch (err) {
      throw new StoreError('subDoc remove failed', err);
    }
  }

  async findArraySubDocuments(mainDocCriteria, subDocProperty, options) {
    let {filter, sort, paginate} = this.sanitizeFindArgs(options);

    try {
      return await this.storeEngine.findArraySubDocuments(mainDocCriteria, subDocProperty, {filter, sort, paginate});

    } catch (err) {
      throw new StoreError('subDoc find failed', err);
    }
  }

  async findArraySubDocumentById(mainDocCriteria, subDocProperty, subDocIdProperty, subDocId) {
    return await this.findOneArraySubDocument(mainDocCriteria, subDocProperty, {filter: {[subDocIdProperty]: subDocId}})
  }

  async findOneArraySubDocument(mainDocCriteria, subDocProperty, options) {
    let {filter, sort, paginate} = this.sanitizeFindArgs(options);

    try {
      let result = await this.storeEngine.findOneArraySubDocument(mainDocCriteria, subDocProperty, {
        filter,
        sort,
        paginate
      });

      return result;
    } catch (err) {
      throw new StoreError('subDoc find failed', err);
    }
  }

  async updateArraySubDocument(mainDocCriteria, subDocProperty, subDocIdProperty, subDocId, subDoc) {
    try {
      return await this.storeEngine.updateArraySubDocument(mainDocCriteria, subDocProperty, subDocIdProperty, subDocId, subDoc);
    } catch (err) {
      throw new StoreError('subDoc update failed', err);
    }
  }

  async findFilterByIdArraySubDocument(localIdProperty, foreignCollectionName, foreignIdProperty, foreignId, foreignArrayProperty, options) {
    try {
      let sanitizedOptions = this.sanitizeFindArgs(options);
      return await this.storeEngine.findFilteredByIdArraySubDocument(localIdProperty, foreignCollectionName, foreignIdProperty, foreignId, foreignArrayProperty, sanitizedOptions)
    } catch (err) {
      console.error(err);
      throw new StoreError('find filtered by joinfailed', err);
    }
  }

  async findFilteredByForeignIdArraySubDocument(foreignCollectionName, foreignArrayProperty, foreignArrayPropertyId, foreignResultProperty, options) {
    try {
      let sanitizedOptions = this.sanitizeFindArgs(options);
      return await this.storeEngine.findFilteredByForeignIdArraySubDocument(foreignCollectionName, foreignArrayProperty, foreignArrayPropertyId, foreignResultProperty, sanitizedOptions)
    } catch (err) {
      console.error(err);
      throw new StoreError('find by findFilteredByForeignIdArraySubDocument failed', err);
    }
  }

  async forEach(action){
    return await this.storeEngine.forEach(action)
  }


  sanitizeFindArgs({filter, sort, paginate, returnAllDocs, allowAllFields}) {
    filter = filter || {};
    sort = sort || {};
    sort[this.idProperty] = 1;
    paginate = paginate || {};
    paginate.limit = paginate.limit || PAGINATE_ITEM_LIMIT;
    paginate.skip = paginate.skip || PAGINATE_ITEM_SKIP_MIN;

    if (paginate.limit > PAGINATE_ITEM_LIMIT || paginate.limit < PAGINATE_ITEM_MIN) {
      paginate.limit = PAGINATE_ITEM_LIMIT;
    }

    if (paginate.skip < PAGINATE_ITEM_SKIP_MIN) {
      paginate.skip = PAGINATE_ITEM_SKIP_MIN;
    }

    assert.equal(typeof paginate.limit, 'number');
    assert.equal(typeof paginate.skip, 'number');

    if (!allowAllFields) {
      filter = deepFilter(filter, (value, prop /*, subject*/) => {
        let keep = this._filterableFields.includes(prop) || CRITERIA_OPERATORS.includes(prop);
        if (!keep) {
          logger.warn(`Attempt to filter on an invalid property or an illegal operator was used: ${prop}`);
        }
        return keep;
      });

      sort = deepFilter(sort, (value, prop /*, subject*/) => {
        let keep = this._sortableFields.includes(prop);
        if (!keep) {
          logger.warn(`Attempt to sort on an invalid property ${prop}`);
        }
        return keep;
      });
    }

    return {filter, sort, paginate, returnAllDocs};
  }

}

module.exports = BaseStore;
