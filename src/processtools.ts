// @ts-nocheck
const ObjectId = require('bson').ObjectID;
const Join = require('join');
const extendRelationship = require('./extendRelationship').extend;
const extendPath = require('./extendPath').extend;
const { Semantic } = require('./semanticTypes');

// private
// dbhandler
let mongoose = null;
let neo4j    = null;

const setMongoose = mongooseHandler => mongoose = mongooseHandler;
const getMongoose = () => mongoose;

const setNeo4j = neo4jHandler => neo4j = neo4jHandler;
const getNeo4j = () => neo4j;

const sortOptionsAndCallback = function(options, cb) {
  if (typeof options === 'function') {
    return { options: {}, cb: options };
  } else {
    return { options: options || {}, cb };
  }
};

const sortAttributesAndCallback = function(attributes, cb) {
  let options;
  ({options,cb} = sortOptionsAndCallback(attributes, cb));
  return { attributes: options, cb};
};

const sortJoins = function(args) {
  args = Array.prototype.slice.call(args);
  const returns = { errors: [] , result: [] };
  for (var arg of args) {
    if (arg[0]) { returns.errors.push(arg[0]); }
    if (arg[1]) { returns.errors.push(arg[1]); }
  }
  returns.errors = returns.errors.length > 0 ? Error(returns.errors.join(", ")) : null; 
  returns.result = returns.result.length > 0 ? returns.result : null;
  return returns;
};

const sortTypeOfRelationshipAndOptionsAndCallback = function(r, o, c) {
  let cb, options;
  const returns = { typeOfRelationship: '*', options: {}, cb: null };
  if (typeof r === 'string') {
    returns.typeOfRelationship = r;
    ({options,cb} = sortOptionsAndCallback(o,c));
    returns.options = options;
    returns.cb = cb;
  } else if (typeof r === 'object') {
    ({options,cb} = sortOptionsAndCallback(r,o));
    returns.options = options;
    returns.cb = cb;
  } else {
    returns.cb = r;
  }
  return returns;
};

// extract the constructor name as string
const constructorNameOf = f => __guard__(__guard__(__guard__(f != null ? f.constructor : undefined, x2 => x2.toString().match(/function\s+(.+?)\(/)), x1 => x1[1]), x => x.trim()) || null;

const extractCollectionAndId = function(s) {
  let parts;
  if (parts = s.split(":")) {
    const collectionName = Semantic.collectionName(parts[0]);
    const documentIdentifier = Semantic.documentIdentifier(parts[1]);
    collectionName.validate();
    documentIdentifier.validate();
    return { collectionName: collectionName.value, _id: documentIdentifier.value };
  }
};

const _buildQueryFromIdAndCondition = function(_id_s, condition) {
  let idCondition;
  if ((_id_s != null ? _id_s.constructor : undefined) === Array) {
    idCondition = { _id: { $in: _id } };
  } else if (_id_s) {
    idCondition = { _id: String(_id_s) };
  } else {
    return {};
  }
  if ((typeof condition === 'object') && condition && (__guard__(Object.keys(condition), x => x.length) > 0)) { return { $and: [ idCondition, condition ] }; } else { return idCondition; }
};

// extract id as string from a mixed argument
const getObjectIDAsString = function(obj) {
  if (typeof obj === 'string') {
    return obj;
  } else if (typeof obj === 'object') {
    return (String)(obj._id || obj);
  } else {
    return '';
  }
};

const getObjectIdFromString = s => {
  const documentIdentifier = Semantic.documentIdentifier(s);
  documentIdentifier.validate();
  return new ObjectId(documentIdentifier.value);
};

// extract id's from a mixed type
const getObjectIDsAsArray = function(mixed) {
  let ids = [];
  if ((mixed != null ? mixed.constructor : undefined) === Array) {
    for (var item of mixed) {
      var id;
      if (id = getObjectIDAsString(item)) { ids.push(id); }
    }
  } else {
    ids = [ getObjectIDAsString(mixed) ];
  }
  return ids;
};

const getModelByCollectionName = function(collectionName, mongooseHandler = mongoose) {
  const atomicCollectionName = Semantic.collectionName(collectionName);
  atomicCollectionName.validate();
  collectionName = atomicCollectionName.value;
  let models;
  if (constructorNameOf(mongooseHandler) === 'Mongoose') {
    ({
      models
    } = mongooseHandler);
  } else if (!mongooseHandler) {
    return null;
  } else {
    // we assume that we have mongoose.models here
    models = mongoose;
  }
  let name = null;
  for (var nameOfModel in models) {
    // iterate through models and find the corresponding collection and modelname
    var i = models[nameOfModel];
    if (collectionName === models[nameOfModel].collection.name) {
      name = models[nameOfModel];//.modelName
    }
  }
  return name;
};

const getModelNameByCollectionName = (collectionName, mongooseHandler = mongoose) => __guard__(getModelByCollectionName(collectionName, mongooseHandler), x => x.modelName);

const getCollectionByCollectionName = function(collectionName, mongooseHandler = mongoose) {
  const modelName = getModelNameByCollectionName(collectionName, mongooseHandler);
  return mongooseHandler.models[modelName] || (mongooseHandler.connections[0] != null ? mongooseHandler.connections[0].collection(collectionName) : undefined) || mongooseHandler.collection(collectionName);
};

// Iterates through the neo4j's resultset and attach documents from mongodb
// =====
//
// Currently we having three different of expected Objects: Node, Relationship and Path
// TODO: maybe split up to submethods for each object type
// TODO: reduce mongodb queries by sorting ids to collection(s) and query them once per collection with $in : [ ids... ] ...

const populateResultWithDocuments = function(results, options, cb) {
  let result;
  ({options, cb} = sortOptionsAndCallback(options,cb));
  
  options.count ??= false;
  options.restructure ??= true; // do some useful restructure
  options.referenceDocumentID ??= null; // document which is our base document, import for where queries
  if (options.referenceDocumentID) { options.referenceDocumentID = String(options.referenceDocumentID); }
  options.relationships ??= {};
  options.collection ??= null; // distinct collection
  if (options.where != null) {
    options.where.document ??= null;
  } // query documents
  if (options.debug != null) {
    options.debug.where ??= [];
  }
  options.stripEmptyItems ??= true;
  

  if (!(results instanceof Object)) {
    return cb(new Error('Object is needed for processing'), null, options);
  } else if (!(results instanceof Array)) {
    // put in array to iterate
    results = [ results ];
  }

  // Finally called when *all* documents are loaded and we can pass the result to cb
  const final = function(err) {
    // [ null, {...}, null, ..., {...}, {...} ] ->  [ {...}, ..., {...}, {...} ]
    // return only path if we have a path here and the option is set to restructre
    // TODO: find a more elegant solution than this
    if (options.restructure && ((path != null ? path.length : undefined) > 0)) {
      results = path;
    }
    if (options.stripEmptyItems && ((results != null ? results.length : undefined) > 0)) {
      const cleanedResults = [];
      for (var result of results) {
        if (result != null) { cleanedResults.push(result); }
      }
      if (typeof cb === 'function') { return cb(null, cleanedResults, options); }
    } else {
      if (typeof cb === 'function') { return cb(null, results, options); }
    }
  };

  // TODO: if distinct collection

  mongoose = getMongoose();  // get mongoose handler
  const graphdb  = getNeo4j();     // get neo4j handler


  // TODO: extend Path and Relationship objects (nit possible with prototyping here) 

  var path = null;

  const join = Join.create();
  for (let i = 0; i < results.length; i++) {
    result = results[i];
    (function(result, i) {
      
      // ### NODE
      let callback, collection, conditions, isReferenceDocument;
      if ((constructorNameOf(result) === 'Node') && (result.data != null ? result.data._collection : undefined) && (result.data != null ? result.data._id : undefined)) { 
        callback = join.add();
        isReferenceDocument = options.referenceDocumentID === result.data._id;
        // skip if distinct collection if differ
        if (options.collection && (options.collection !== result.data._collection)) {
          return callback(err, results);
        } else {
          conditions = _buildQueryFromIdAndCondition(result.data._id, !isReferenceDocument ? (options.where != null ? options.where.document : undefined) : undefined);
          if (options.debug != null) {
            options.debug.where.push(conditions);
          }
          collection = getCollectionByCollectionName(result.data._collection, mongoose);
          return collection.findOne(conditions, function(err, foundDocument) {
            results[i].document = foundDocument;
            return callback(err, results);
          });
        }
      
      // ### RELATIONSHIP
      } else if ((constructorNameOf(result) === 'Relationship') && (result.data != null ? result.data._from : undefined) && (result.data != null ? result.data._to : undefined)) {
        // TODO: trigger updateRelationships for both sides if query was about and option is set to
        callback = join.add();
        const fromAndToJoin = Join.create();
        // Extend out Relationship object with additional methods
        extendRelationship(result);
        for (var point of [ 'from', 'to']) {
          var intermediateCallback = fromAndToJoin.add();
          (function(point, intermediateCallback) {
            const {collectionName,_id} = extractCollectionAndId(result.data[`_${point}`]);
            isReferenceDocument = options.referenceDocumentID === _id;
            // do we have a distinct collection and this records is from another collection? skip if so
            if (options.collection && (options.collection !== collectionName) && !isReferenceDocument) { 
              // remove relationship from result
              results[i] = null;
              return intermediateCallback(null,null); //  results will be taken directly from results[i]
            } else {
              conditions = _buildQueryFromIdAndCondition(_id, !isReferenceDocument ? (options.where != null ? options.where.document : undefined) : undefined);
              __guard__(options.debug != null ? options.debug.where : undefined, x => x.push(conditions));
              collection = getCollectionByCollectionName(collectionName, mongoose);
              return collection.findOne(conditions, function(err, foundDocument) {
                if (foundDocument && results[i]) {
                  results[i][point] = foundDocument;
                } else {
                  // remove relationship from result
                  results[i] = null;
                }
                return intermediateCallback(null,null);
              }); // results will be taken directly from results[i]
            }
          })(point, intermediateCallback);
        }
        return fromAndToJoin.when(() => callback(null, null));

      // ### PATH
      } else if ((constructorNameOf(result) === 'Path') || (constructorNameOf(result[options.processPart]) === 'Path') ||  (constructorNameOf(result.path) === 'Path')) {
        // Define an object identifier for processPart
        const _p = result[options.processPart] || result.path || result;
        extendPath(_p);
        results[i].path = Array(_p._nodes.length);
        path = options.restructure ? Array(_p._nodes.length) : undefined;
        return (() => {
          const result1 = [];
          for (let k = 0; k < _p._nodes.length; k++) {
            var node = _p._nodes[k];
            if (node._data != null ? node._data.self : undefined) {
              callback = join.add();
              result1.push((((k, callback) => graphdb.getNode(node._data.self, function(err, foundNode) {
                if (__guard__(foundNode != null ? foundNode.data : undefined, x => x._id)) {
                  isReferenceDocument = options.referenceDocumentID === foundNode.data._id;
                  const collectionName = foundNode.data._collection;
                  const {
                    _id
                  } = foundNode.data;
                  if (options.collection && (options.collection !== collectionName) && !isReferenceDocument) { 
                    return callback(null, path || results);
                  } else {
                    conditions = _buildQueryFromIdAndCondition(_id, options.where != null ? options.where.document : undefined);
                    __guard__(options.debug != null ? options.debug.where : undefined, x1 => x1.push(conditions));
                    collection = getCollectionByCollectionName(collectionName, mongoose);
                    return collection.findOne(conditions, function(err, foundDocument) {
                      if (options.restructure) {
                        // just push the documents to the result and leave everything else away
                        path[k] = foundDocument;
                      } else {
                        results[i].path[k] = foundDocument;
                      }
                      return callback(null, path || results);
                    });
                  }
                } else {
                  if (options.restructure) {
                    path[k] = null;
                  } else {
                    results[i].path[k] = null;
                  }
                  return callback(null, path || results);
                }
              })))(k, callback));
            } else {
              result1.push(undefined);
            }
          }
          return result1;
        })();
      } else {
        return final(new Error("Could not detect given result type"),null);
      }
    })(result, i);
  }
  
  // ### If all callbacks are fulfilled 

  return join.when(function() {
    let error;
    ({error,result} = sortJoins(arguments));
    return final(error, null);
  });
};

module.exports = {
  populateResultWithDocuments,
  getObjectIDAsString,
  getObjectIDsAsArray,
  constructorNameOf,
  getObjectIdFromString,
  sortOptionsAndCallback,
  sortAttributesAndCallback,
  sortTypeOfRelationshipAndOptionsAndCallback,
  getModelByCollectionName,
  getModelNameByCollectionName,
  getCollectionByCollectionName,
  setMongoose,
  setNeo4j,
  extractCollectionAndId,
  ObjectId };


function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}