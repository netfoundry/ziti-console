'use strict';

/* Copyright 2018 NetFoundry. All rights reserved.
 * Permission to use under license from NetFoundry.
 * Redistribution or reproduction not permitted
 */

const crypto = require('crypto');
const logger = require('@netfoundry/zt-logger')();


/**
 * 
 * 
 */
async function getPersistentCryptoRecord(model) {

  let cryptoStore = model['crypto'].store;

  let cryptoRecord = await cryptoStore.findById('1');

  if (!cryptoRecord) {

    const key = crypto.randomBytes(32).toString('hex').slice(0, 32);
    const iv = crypto.randomBytes(16).toString('hex').slice(0, 16);

    cryptoRecord = {};
    cryptoRecord.id = '1';
    cryptoRecord.key = key;
    cryptoRecord.iv = iv;

    await cryptoStore.insertOne(cryptoRecord);
  }

  return cryptoRecord;
}

function addRandomPadding(text) {
  var d = new Date();
  var n = d.toString();
  let newText = n + "#" + text;
  return newText;
}

function removeRandomPadding(text) {
  var newText = text.split('#').pop();
  return newText;
}

module.exports = {

  encrypt: async (model, text) => {

    let cryptoRecord = await getPersistentCryptoRecord(model);

    let cipher = crypto.createCipheriv('aes-256-cbc', cryptoRecord.key, cryptoRecord.iv);
    let encrypted = cipher.update(addRandomPadding(text));
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted.toString('hex');
  },
  
  decrypt: async (model, text) => {

    let cryptoRecord = await getPersistentCryptoRecord(model);

    let encryptedText = Buffer.from(text, 'hex');
    let decipher = crypto.createDecipheriv('aes-256-cbc', cryptoRecord.key, cryptoRecord.iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    let decryptedString = decrypted.toString();
    return removeRandomPadding(decryptedString);
  },

};