'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const logger = require('@netfoundry/zt-logger')();
const assert = require('assert');
const StoreEngineError = require('./base-store-errors').StoreEngineError;

class BaseStoreMongoDB {
  constructor(db, collectionName, ttl) {
    assert.ok(db, 'mongoDbClient must be specifieid');
    assert.ok(collectionName, 'collectionName must be specified');
    this._db = db;
    this._collectionName = collectionName;
    this._ttl = ttl;
  }

  get collectionName() {
    assert.ok(this._collectionName);
    return this._collectionName;
  }

  async destroy() {
    let collections = await this._db.collections();
    if (collections.find((collection) => {
      return collection.collectionName === this.collectionName;
    })) {
      await this._db.dropCollection(this.collectionName);
    }
  }

  async initialize({uniqueFields, ttl}) {
    logger.info(`uniqueFields: `, uniqueFields);
    logger.info(`ttl: `, ttl);

    let collections = await this._db.collections();
    if (!collections.find((collection) => {
      return collection.collectionName === this.collectionName;
    })) {
      await this._db.createCollection(this.collectionName);
    }

    let indexSpecs = uniqueFields.map((field) => {
      if (field instanceof Array) {
        return {
          key: Object.assign(...(field.map((subField) => ({[subField]: 1})))),
          name: `u_${this.collectionName}#${field.join(';')}`,
          unique: true,
          partialFilterExpression: Object.assign(...(field.map((subField) => ({[subField]: {$exists: true}})))),
        };
      } else {
        return {
          key: {[field]: 1},
          name: `u_${this.collectionName}#${field}`,
          unique: true,
          partialFilterExpression: {[field]: {$exists: true}},
        };
      }
    });

    let results = await this._db.collection(this.collectionName).createIndexes(indexSpecs);

    if (ttl) {
      await this._db.collection(this.collectionName).createIndex( { updatedAt: 1 }, { expireAfterSeconds: ttl } );
    }

    if (!(results instanceof Array)) {
      results = [results];
    }

    let erroredResults = results.filter((result) => {
      return !!result.error
    });

    if (erroredResults.length > 0) {
      throw new StoreEngineError('Failed to create unique indexes', erroredResults);
    }
  }

  async insertOne(obj) {
    assert.ok(obj, 'obj must be specifieid');
    try {

      let result = await this._db.collection(this.collectionName).insertOne(obj);
      return !!result.insertedId;
    } catch (err) {
      if (err.code = 11000) {
        let matches = err.message.match(/u_(.*?)#(.*?) /);
        let fields = matches[2].split(';');
        err = new StoreEngineError(`Duplicate value found in ${fields}`, err);
        err.fields = fields;
        err.collection = this.collectionName;
        err.code = 'DUPLICATE_VALUE';
      }
      logger.error(`Failed to insert to collection ${this.collectionName}`, err);
      throw err;
    }
  }

  async updateOne(filter, obj) {
    assert.ok(filter);
    assert.ok(obj);
    try {
      let result = await this._db.collection(this.collectionName).replaceOne(filter, obj);
      return result;
    } catch (err) {
      logger.error(`Failed to update collection ${this.collectionName}`, err);
      throw err;
    }
  }

  async removeMany(criteria) {
    try {
      let result = await this._db.collection(this.collectionName).deleteMany(criteria);
      return result.result.n;
    } catch (err) {
      logger.error(`Failed to removeMany() from the collection ${this.collectionName}`, err);
      throw err;
    }
  }

  async removeOne(criteria) {
    try {
      let result = await this._db.collection(this.collectionName).deleteOne(criteria);
      return result.result.n;
    } catch (err) {
      logger.error(`Failed to removeOne() from the collection ${this.collectionName}`, err);
      throw err;
    }
  }

  async find({filter, sort, paginate, returnAllDocs}) {
    try {
      let cursor = this._db.collection(this.collectionName).find(filter).sort(sort);

      if (!returnAllDocs) {
        cursor = cursor.skip(paginate.skip).limit(paginate.limit);
      }

      return cursor.toArray();
    } catch (err) {
      logger.error(`Failed to find() from collection ${this.collectionName}`, err);
      throw err;
    }
  }

  async findOne(filter) {
    logger.info("this.collectionName: ", this.collectionName);

    try {
      let item = await this._db.collection(this.collectionName).findOne(filter);
      logger.info("",item);
      return item;
    } catch (err) {
      logger.error(`Failed to findOne() from collection ${this.collectionName}`, err);
      throw err;
    }
  }

  async forEach(action) {
    try {
      let cursor = await this._db.collection(this.collectionName).find();
      cursor.forEach((doc) => {
        try {
          action(doc)
        } catch (err) {
          logger.error('Collection forEach error: ', err)
        }
      });
    } catch (err) {
      logger.error(`Failed to findOne() from collection ${this.collectionName}`, err);
      throw err;
    }
  }

  async insertArraySubDocument(mainDocCriteria, subDocProperty, subDoc) {
    assert.ok(subDocProperty, 'subDocProperty must not be specified');
    assert.ok(subDoc, 'subDoc must be specifieid');
    try {
      let collection = this._db.collection(this._collectionName);

      let pushCriteria = {};
      pushCriteria[subDocProperty] = subDoc;

      let result = await collection.updateOne(
        mainDocCriteria,
        {$push: pushCriteria}
      );

      if (result.writeConcernError) {
        throw new StoreEngineError('Failed to acknowledge the sub-document insert', result.writeConcernError);
      } else {
        return subDoc.id;
      }
    } catch (err) {
      logger.error(`Failed to insert array sub document for ${this._colllectionName} for property ${subDocProperty}`, err);
      throw err;
    }
  }

  async removeArraySubDocument(mainDocCriteria, subDocProperty, subDocCriteria, {multi = false} = {multi: false}) {
    assert.ok(subDocProperty, 'subDocProperty must not be specified');
    assert.ok(subDocCriteria, 'subDocCriteria must be specified');
    try {
      let collection = this._db.collection(this._collectionName);
      let pullCriteria = {};
      pullCriteria[subDocProperty] = subDocCriteria;

      let result = null;
      if (multi) {
        result = await collection.update(
          mainDocCriteria,
          {$pull: pullCriteria},
          {multi}
        );
      } else {
        result = await collection.updateOne(
          mainDocCriteria,
          {$pull: pullCriteria},
          {multi}
        );
      }


      if (result.writeConcernError) {
        throw new StoreEngineError('Failed to acknowledge the sub-document insert', result.writeConcernError);
      } else {
        return result.result.ok;
      }
    } catch (err) {
      logger.error(`Failed to remove array sub document for ${this._colllectionName} for property ${subDocProperty}`, err);
      throw err;
    }
  }

  async findArraySubDocuments(mainDocCriteria, subDocProperty, {filter, paginate, sort}) {
    try {
      sort = sort || {};
      sort = {...sort, _id: 1};

      let cursor = await this._db.collection(this._collectionName).aggregate([
        {'$match': mainDocCriteria},
        {'$unwind': `$${subDocProperty}`},
        {'$replaceRoot': {newRoot: `$${subDocProperty}`}},
        {'$match': filter},
        {'$sort': sort},
        {'$skip': paginate.skip},
        {'$limit': paginate.limit}
      ]);
      let docs = await cursor.toArray();
      return docs;
    } catch (err) {
      logger.error(`Failed to find array sub document for ${this._colllectionName} for property ${subDocProperty}`, err);
      throw err;
    }
  }

  async findOneArraySubDocument(mainDocCriteria, subDocProperty, {filter}) {
    try {

      let cursor = await this._db.collection(this._collectionName).aggregate([
        {'$match': mainDocCriteria},
        {'$unwind': `$${subDocProperty}`},
        {'$replaceRoot': {newRoot: `$${subDocProperty}`}},
        {'$match': filter},
        {'$skip': 0},
        {'$limit': 1}
      ]);
      let docs = await cursor.toArray();
      if (docs.length === 0) {
        return null
      }
      return docs[0];
    } catch (err) {
      logger.error(`Failed to find array sub document for ${this._colllectionName} for property ${subDocProperty}`, err);
      throw err;
    }
  }

  async findArraySubDocumentById(mainDocCriteria, subDocProperty, subDocIdProperty, subDocId) {
    try {
      let filter = {[subDocIdProperty]: subDocId};

      return this.findOneArraySubDocument(mainDocCriteria, subDocProperty, {filter})
    } catch (err) {
      logger.error(`Failed to find array sub document for ${this._colllectionName} for property ${subDocProperty}`, err);
      throw err;
    }
  }

  async updateArraySubDocument(mainDocCriteria, subDocProperty, subDocIdProperty, subDocId, subDoc) {
    assert.ok(mainDocCriteria, 'mainDocument criteria must be specified');
    assert.ok(subDocProperty, 'subDocProperty must be specified');
    assert.ok(subDocIdProperty, 'subDocIdProperty must be specified');
    assert.ok(subDocId, 'subDocId must be specified');
    assert.ok(subDoc, ' subDoc must be specified');
    assert.ok(subDoc[subDocIdProperty], 'subDoc must have a subDoc property id');
    try {
      let filter = {...mainDocCriteria};
      filter[subDocProperty + '.' + subDocIdProperty] = subDocId;
      let setProperty = subDocProperty + '.$';
      let setValue = {};
      setValue[setProperty] = subDoc
      return this._db.collection(this._collectionName).updateOne(filter, {$set: setValue})
    } catch (err) {
      logger.error(`Failed to update array sub document for ${this._colllectionName} for property ${subDocProperty}`, err);
      throw err;
    }

  }

  async findFilteredByIdArraySubDocument(localIdProperty, foreignCollectionName, foreignIdProperty, foreignId, foreignArrayProperty, {filter, sort, paginate}) {

    let cursor = this._db.collection(this._collectionName).aggregate(
      {
        "$lookup": {
          "from": foreignCollectionName,
          "localField": localIdProperty,
          "foreignField": foreignArrayProperty,
          "as": "filterByItems"
        }
      },
      {"$match": {[`filterByItems.${foreignIdProperty}`]: foreignId}},
      {"$project": {"filterByItems": 0}},
      {'$match': filter},
      {'$sort': sort},
      {'$skip': paginate.skip},
      {'$limit': paginate.limit}
    );
    return await cursor.toArray();
  }

  async findFilteredByForeignIdArraySubDocument(foreignCollectionName, foreignArrayProperty, foreignArrayPropertyId, foreignResultProperty, {filter, sort, paginate, returnAllDocs}) {
    try {
      let filterValueCursor = this._db.collection(foreignCollectionName).aggregate(
        [{"$match": {[foreignArrayProperty]: foreignArrayPropertyId}},
          {"$project": {[foreignResultProperty]: 1}},
          {"$unwind": `$${foreignResultProperty}`},
          {
            "$group": {
              _id: `$${foreignResultProperty}`,
              "id": {"$first": `$${foreignResultProperty}`}
            }
          }]
      );

      let filterValues = await filterValueCursor.toArray();
      filterValues = filterValues.map(doc => {
        return doc.id
      });

      filter = {"$and": [{"id": {"$in": filterValues}}, filter]};

      return this.find({filter, sort, paginate, returnAllDocs});

    } catch (err) {
      logger.error(`Failed to findFilteredByForeignIdArraySubDocument() from collection ${this.collectionName}`, err);
      throw err;
    }


  }
}

module.exports = BaseStoreMongoDB;