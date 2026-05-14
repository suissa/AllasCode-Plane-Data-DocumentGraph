// @ts-nocheck
// ### Extend Document
//
// This models extends the mongodb/mongoose Document with:
// * allows creating, deleting and querying all kind of incoming and outgoing relationships
// * native queries on neo4j with option to load Documents by default
// * connects each Document with corresponding Node in neo4j
//
// TODO: check that we always get Documents as mongoose models

const _s = require('underscore.string');
const processtools = require('./processtools');
const Join = require('join');

module.exports = function(globalOptions) {

  const {
    mongoose
  } = globalOptions;
  const graphdb  = globalOptions.neo4j;

  // Check that we don't override existing functions
  if (globalOptions.overrideProtoypeFunctions !== true) {
    for (var functionName of [
      'applyGraphRelationships',
      'removeNode',
      'shortestPathTo',
      'allRelationshipsBetween',
      'incomingRelationshipsFrom',
      'outgoingRelationshipsTo',
      'removeRelationships',
      'removeRelationshipsBetween',
      'removeRelationshipsFrom',
      'removeRelationshipsTo',
      'outgoingRelationships',
      'incomingRelationships',
      'allRelationships',
      'queryRelationships',
      'queryGraph',
      'createRelationshipBetween',
      'createRelationshipFrom',
      'createRelationshipTo',
      'getNodeId',
      'findOrCreateCorrespondingNode',
      'findCorrespondingNode',
      'dataForNode',
      'indexGraph'
    ]) {
      if (typeof mongoose.Document.prototype[functionName] !== 'undefined') { throw new Error(`Will not override mongoose::Document.prototype.${functionName}`); }
    }
  }

  const {
    Document
  } = mongoose;

  processtools.setMongoose(mongoose);

  let node = graphdb.createNode();

  //### Allows extended querying to the graphdb and loads found Documents
  //### (is used by many methods for loading incoming + outgoing relationships)
  // @param typeOfRelationship = '*' (any relationship you can query with cypher, e.g. KNOW, LOVE|KNOW ...)
  // @param options = {}
  // (first value is default)
  // * direction (both|incoming|outgoing)
  // * action: (RETURN|DELETE|...) (all other actions wich can be used in cypher)
  // * processPart: (relationship|path|...) (depends on the result you expect from our query)
  // * loadDocuments: (true|false)
  // * endNode: '' (can be a node object or a nodeID)
  Document.prototype.queryRelationships = function(typeOfRelationship, options, cb) {
    if (!this.schema.get('graphability')) { return cb(Error('No graphability enabled'), null); }
    // REMOVED: options can be a cypher query as string
    // options = { query: options } if typeof options is 'string'
    ({typeOfRelationship,options, cb} = processtools.sortTypeOfRelationshipAndOptionsAndCallback(typeOfRelationship,options,cb));
    // build query from options
    typeOfRelationship          ??= '*';
    typeOfRelationship           = /^[*:]{1}$/.test(typeOfRelationship) || !typeOfRelationship ? '' : ':'+typeOfRelationship;
    options.direction           ??= 'both';
    options.action              ??= 'RETURN';
    if (options.count || options.countDistinct) {
      if (options.countDistinct) { options.count              = 'distinct '+options.countDistinct; }
      options.returnStatement    = 'count('+options.count+')';
      options.processPart        = 'count('+options.count+')';
    }
    options.processPart         ??= 'r';
    options.returnStatement     ??= options.processPart;
    options.referenceDocumentID ??= this._id;
    // endNode can be string or node object
    if (typeof endNode === 'object') { options.endNodeId            = endNode.id; }
    if (options.debug === true) { options.debug = {}; }
    const doc = this;
    const id = processtools.getObjectIDAsString(doc);
    return this.getNode(function(nodeErr, fromNode) {
      // if no node is found
      if (nodeErr) { return cb(nodeErr, null, options); }



      let cypher = `\
START a = node(%(id)s)%(endNodeId)s
MATCH (a)%(incoming)s[r%(relation)s]%(outgoing)s(b)
%(whereRelationship)s
%(action)s %(returnStatement)s;\
`;



      cypher = _s.sprintf(cypher, {
        id:                 fromNode.id,
        incoming:           options.direction === 'incoming' ? '<-' : '-',
        outgoing:           options.direction === 'outgoing' ? '->' : '-',
        relation:           typeOfRelationship,
        action:             options.action.toUpperCase(),
        returnStatement:    options.returnStatement,
        whereRelationship:  (options.where != null ? options.where.relationship : undefined) ? `WHERE ${options.where.relationship}` : '',
        endNodeId:          (options.endNodeId != null) ? `, b = node(${options.endNodeId})` : ''
      }
      );
      options.startNode     ??= fromNode.id; // for logging


      // take query from options and discard build query
      if (options.cypher) { ({
        cypher
      } = options); }
      if (options.debug != null) {
        options.debug.cypher ??= [];
      }
      __guard__(options.debug != null ? options.debug.cypher : undefined, x => x.push(cypher));
      if (options.dontExecute) {
        return cb(Error("`options.dontExecute` is set to true..."), null, options);
      } else {
        return _queryGraphDB(cypher, options, cb);
      }
    });
  };


  //### Loads the equivalent node to this Document
  Document.prototype.findCorrespondingNode = function(options, cb) {
    ({options, cb} = processtools.sortOptionsAndCallback(options,cb));
    if (!this.schema.get('graphability')) { return cb(Error('No graphability enabled'), null); }
    const doc = this;

    // you can force a reloading of a node
    // so you can ensure to get the latest existing node directly from db
    options.forceReload ??= false;

    if (globalOptions.cacheAttachedNodes && doc._cached_node && (options.forceReload !== true)) { return cb(null, doc._cached_node, options); }

    const collectionName = doc.constructor.collection.name;
    const id = processtools.getObjectIDAsString(doc);

    // Difference between doCreateIfNotExists and forceCreation:
    //
    //   * doCreateIfNotExists -> persist the node if no corresponding node exists
    //   * forceCreation -> forces to create a node
    //
    // @forceCreation: this is needed because mongoose marks each document as
    // doc.new = true (which is checked to prevent accidently creating orphaned nodes).
    // As long it is 'init' doc.new stays true, but we need that to complete the 'pre' 'save' hook
    // (see -> mongraphMongoosePlugin)

    options.doCreateIfNotExists ??= false;
    options.forceCreation ??= false;

    // Find equivalent node in graphdb

    // TODO: cache existing node

    const _processNode = function(node, doc, cb) {
      // store document data also als in node -> untested and not recommend
      // known issue: neo4j doesn't store deeper levels of nested objects...
      if (globalOptions.storeDocumentInGraphDatabase) {
        node.data = doc.toObject(globalOptions.storeDocumentInGraphDatabase);
        node.save();
      }
      // store node_id on document
      doc._node_id = node.id;
      if (globalOptions.cacheAttachedNodes) { doc._cached_node = node; }
      return cb(null, node, options);
    };

    if ((doc.isNew === true) && (options.forceCreation !== true)) {
      return cb(new Error("Can't return a 'corresponding' node of an unpersisted document"), null, options);
    } else if (doc._node_id != null) {
      return graphdb.getNodeById(doc._node_id, function(errFound, node) {
        if (errFound) {
          return cb(errFound, node, options);
        } else {
          return _processNode(node,doc,cb);
        }
      });
    } else if (options.doCreateIfNotExists || (options.forceCreation === true)) {
      // create a new one
      node = graphdb.createNode({ _id: id, _collection: collectionName });
      return node.save(function(errSave, node) {
        if (errSave) {
          return cb(errSave, node, options);
        } else {
          // do index for better queries outside mongraph
          // e.g. people/_id/5178fb1b48c7a4ae24000001
          return node.index(collectionName, '_id', id, () => _processNode(node, doc, cb));
        }
      });
    } else {
      return cb(null, null, options);
    }
  };

  //### Finds or create equivalent Node to this Document
  Document.prototype.findOrCreateCorrespondingNode = function(options, cb) {
    ({options, cb} = processtools.sortOptionsAndCallback(options,cb));
    return this.findCorrespondingNode(options, cb);
  };

  // Recommend to use this method instead of `findOrCreateCorrespondingNode`
  // shortcutmethod -> findOrCreateCorrespondingNode
  Document.prototype.getNode = Document.prototype.findOrCreateCorrespondingNode;


  //### Finds and returns id of corresponding Node
  // Faster, because it returns directly from document if stored (see -> mongraphMongoosePlugin)
  Document.prototype.getNodeId = function(cb) {
    if (this._node_id != null) {
      return cb(null, this._node_id);
    } else {
      return this.getNode((err, node) => cb(err, (node != null ? node.id : undefined) || null));
    }
  };

  //### Creates a relationship from this Document to a given document
  Document.prototype.createRelationshipTo = function(doc, typeOfRelationship, attributes = {}, cb) {
    ({attributes,cb} = processtools.sortAttributesAndCallback(attributes,cb));
    if (!this.schema.get('graphability')) { return cb(Error('No graphability enabled'), null); }
    // assign cb + attribute arguments
    if (typeof attributes === 'function') {
      cb = attributes;
      attributes = {};
    }
    // Is needed to load the records from mongodb
    // TODO: Currently we have to store these information redundant because
    // otherwise we would have to request each side for it's represantive node
    // seperately to get the information wich namespace/collection the mongodb records is stored
    // -->  would increase requests to neo4j
    if (globalOptions.relationships.storeIDsInRelationship) {
      attributes._to   ??= doc.constructor.collection.name + ":" + (String)(doc._id);
      attributes._from ??= this.constructor.collection.name    + ":" + (String)(this._id);
    }

    if (globalOptions.relationships.storeTimestamp) {
      attributes._created_at ??= Math.floor(Date.now()/1000);
    }

    // Get both nodes: "from" node (this document) and "to" node (given as 1st argument)
    return this.findOrCreateCorrespondingNode((fromErr, from) => doc.findOrCreateCorrespondingNode(function(toErr, to) {
      if (from && to) {
        return from.createRelationshipTo(to, typeOfRelationship, attributes, function(err, result) {
          if (err) { return cb(err, result); }
          return processtools.populateResultWithDocuments(result, {}, cb);
        });
      } else {
        if (typeof cb === 'function') { return cb(fromErr || toErr, null); }
      }
    }));
  };

  //### Creates an incoming relationship from a given Documents to this Document
  Document.prototype.createRelationshipFrom = function(doc, typeOfRelationship, attributes = {}, cb) {
    ({attributes,cb} = processtools.sortAttributesAndCallback(attributes,cb));
    // alternate directions: doc -> this
    return doc.createRelationshipTo(this, typeOfRelationship, attributes, cb);
  };

  //### Creates a bidrectional relationship between two Documents
  Document.prototype.createRelationshipBetween = function(doc, typeOfRelationship, attributes = {}, cb) {
    // both directions
    ({attributes,cb} = processtools.sortAttributesAndCallback(attributes,cb));
    const from = this;
    const to = doc;
    return from.createRelationshipTo(to, typeOfRelationship, err1 => to.createRelationshipTo(from, typeOfRelationship, err2 => cb(err1 || err2, null)));
  };

  //### Query the graphdb with cypher, current Document is not relevant for the query
  Document.prototype.queryGraph = function(chypherQuery, options, cb) {
    ({options, cb} = processtools.sortOptionsAndCallback(options,cb));
    const doc = this;
    return _queryGraphDB(chypherQuery, options, cb);
  };

  //### Loads incoming and outgoing relationships
  Document.prototype.allRelationships = function(typeOfRelationship, options, cb) {
    ({typeOfRelationship, options, cb} = processtools.sortTypeOfRelationshipAndOptionsAndCallback(typeOfRelationship, options, cb));
    options.direction = 'both';
    options.referenceDocumentID = this._id;
    return this.queryRelationships(typeOfRelationship, options, cb);
  };

  //### Loads in+outgoing relationships between to documents
  Document.prototype.allRelationshipsBetween = function(to, typeOfRelationship, options, cb) {
    ({options,cb} = processtools.sortOptionsAndCallback(options,cb));
    const from = this;
    options.referenceDocumentID ??= from._id;
    options.direction ??= 'both';
    return to.getNode(function(err, endNode) {
      if (!endNode) { return cb(Error('-> toDocument has no corresponding node',null)); }
      options.endNodeId = endNode.id;
      return from.queryRelationships(typeOfRelationship, options, cb);
    });
  };

  //### Loads incoming relationships between to documents
  Document.prototype.incomingRelationshipsFrom = function(to, typeOfRelationship, options, cb) {
    ({options,cb} = processtools.sortOptionsAndCallback(options,cb));
    options.direction = 'incoming';
    return this.allRelationshipsBetween(to, typeOfRelationship, options, cb);
  };

  //### Loads outgoin relationships between to documents
  Document.prototype.outgoingRelationshipsTo = function(to, typeOfRelationship, options, cb) {
    ({options,cb} = processtools.sortOptionsAndCallback(options,cb));
    options.direction = 'outgoing';
    return this.allRelationshipsBetween(to, typeOfRelationship, options, cb);
  };

  //### Loads incoming relationships
  Document.prototype.incomingRelationships = function(typeOfRelationship, options, cb) {
    ({options,cb} = processtools.sortOptionsAndCallback(options,cb));
    options.direction = 'incoming';
    options.referenceDocumentID = this._id;
    return this.queryRelationships(typeOfRelationship, options, cb);
  };

  //### Loads outgoing relationships
  Document.prototype.outgoingRelationships = function(typeOfRelationship, options, cb) {
    ({options,cb} = processtools.sortOptionsAndCallback(options,cb));
    options.direction = 'outgoing';
    options.referenceDocumentID = this._id;
    return this.queryRelationships(typeOfRelationship, options, cb);
  };

  //### Remove outgoing relationships to a specific Document
  Document.prototype.removeRelationshipsTo = function(doc, typeOfRelationship, options, cb) {
    ({options,cb} = processtools.sortOptionsAndCallback(options,cb));
    options.direction ??= 'outgoing';
    options.action = 'DELETE';
    const from = this;
    return doc.getNode(function(nodeErr, endNode) {
      if (nodeErr) { return cb(nodeErr, endNode); }
      options.endNodeId = endNode.id;
      return from.queryRelationships(typeOfRelationship, options, cb);
    });
  };

  //### Removes incoming relationships to a specific Document
  Document.prototype.removeRelationshipsFrom = function(doc, typeOfRelationship, options, cb) {
    const to = this;
    return doc.removeRelationshipsTo(to, typeOfRelationship, options, cb);
  };

  //### Removes incoming ad outgoing relationships between two Documents
  Document.prototype.removeRelationshipsBetween = function(doc, typeOfRelationship, options, cb) {
    ({options,cb} = processtools.sortOptionsAndCallback(options,cb));
    options.direction = 'both';
    return this.removeRelationshipsTo(doc, typeOfRelationship, options, cb);
  };

  //### Removes incoming and outgoing relationships to all Documents (useful bevor deleting a node/document)
  Document.prototype.removeRelationships = function(typeOfRelationship, options, cb) {
    ({options,cb} = processtools.sortOptionsAndCallback(options,cb));
    options.direction = 'both';
    options.action = 'DELETE';
    return this.queryRelationships(typeOfRelationship, options, cb);
  };

  //### Delete node including all incoming and outgoing relationships
  Document.prototype.removeNode = function(options, cb) {
    ({options,cb} = processtools.sortOptionsAndCallback(options,cb));
    if (!this.schema.get('graphability')) { return cb(Error('No graphability enabled'), null); }
    // we don't distinguish between incoming and outgoing relationships here
    // would it make sense?! not sure...
    options.includeRelationships ??= true;
    const doc = this;
    return doc.getNode(function(err, node) {
      // if we have an error or no node found (as expected)
      if (err || (typeof node !== 'object')) {
        if (typeof cb === 'function') { return cb(err || new Error('No corresponding node found to document #'+doc._id), node); }
      } else {
        const cypher = `\
START n = node(${node.id})
OPTIONAL MATCH n-[r]-()
DELETE n${options.includeRelationships ? ', r' : ''}\
`;
        return _queryGraphDB(cypher, options, cb);
      }
    });
  };

  //### Returns the shortest path between this and another document
  Document.prototype.shortestPathTo = function(doc, typeOfRelationship = '', options, cb) {
    ({options,cb} = processtools.sortOptionsAndCallback(options,cb));
    if (!this.schema.get('graphability')) { return cb(Error('No graphability enabled'), null); }
    const from = this;
    const to = doc;
    return from.getNode((errFrom, fromNode) => to.getNode(function(errTo, toNode) {
      if (errFrom || errTo || !fromNode || !toNode) { return cb(new Error("Problem(s) getting from and/or to node")); }
      const levelDeepness = 15;
      const query = `\
START a = node(${fromNode.id}), b = node(${toNode.id})
MATCH path = shortestPath( a-[${typeOfRelationship ? ':'+typeOfRelationship : ''}*..${levelDeepness}]->b )
RETURN path;\
`;
      options.processPart = 'path';
      return from.queryGraph(query, options, cb);
    }));
  };

  Document.prototype.dataForNode = function(options = {}) {
    const self = this;
    let {index} = options;
    index ??= false; // returns fields for indexing if set to true; maybe as own method later
    const {
      paths
    } = self.schema;
    const flattenSeperator = '.'; // make it configurable?!
    const values  = {};
    const indexes = [];
    for (var path in paths) {
      var definition = paths[path];
      if (index) {
        if (((definition.options != null ? definition.options.graph : undefined) === true) && ((definition.options != null ? definition.options.index : undefined) === true)) { indexes.push(path.split('.').join(flattenSeperator)); }
      } else if ((definition.options != null ? definition.options.graph : undefined) === true) {
        values[path.split('.').join(flattenSeperator)] = self.get(path);
      }
    }
    if (index) {
      return indexes;
    } else if (Object.keys(values).length > 0) {
      return values;
    } else {
      return null;
    }
  };

  Document.prototype.indexGraph = function(options, cb) {
    ({options,cb} = processtools.sortOptionsAndCallback(options,cb));
    const doc = this;
    node = options.node || doc._cached_node;
    const index = doc.dataForNode({index: true});

    if (!node) { return cb(Error('No node attached'), null); }
    if (index.length <= 0) { return cb(Error('No field(s) to index'), null); }

    const join = Join.create();
    const collectionName = doc.constructor.collection.name;

    for (var pathToIndex of index) {
      var value = doc.get(pathToIndex);
      // index if have a value
      if (typeof value !== 'undefined') { node.index(collectionName, pathToIndex, value, join.add()); }
    }

    return join.when(function() {
      if (typeof cb === 'function') { return cb(arguments[0], arguments[1]); }
    });
  };


  // TODO: refactor -> split into more methods

  Document.prototype.applyGraphRelationships = function(options, cb) {
    ({options,cb} = processtools.sortOptionsAndCallback(options,cb));
    if (!this.schema.get('graphability')) { return cb(Error('No graphability enabled'), null); }
    // relationships will be stored permanently on this document
    // not for productive usage
    // -> it's deactivated by default, because I'm not sure that it'a good idea
    // to store informations redundant (CAP/syncing)
    options.doPersist ??= false;
    const sortedRelationships = {};
    const typeOfRelationship = '*'; // TODO: make optional
    const doc = this;

    const _finally = function(err, result, options) {
      doc._relationships = sortedRelationships; // attach to current document
      if (typeof cb === 'function') { return cb(err, doc._relationships, options); }
    };

    return doc.getNode(options, function(err, node, options) {
      if (err) { return _finally(err, node, options); }
      return doc.allRelationships(typeOfRelationship, options, function(err, relationships, options) {
        let conditions;
        if (err) { return _finally(err, relationships, options); }
        if ((relationships != null ? relationships.length : undefined) > 0) {
          // add relationships to object, sorted by type (see above for schema)
          for (var relation of relationships) {
            if (relation._data != null ? relation._data.type : undefined) {
              var data = {};
              for (var part of [ 'from', 'to' ]) {
                var {collectionName,_id} = processtools.extractCollectionAndId(relation.data[`_${part}`]);
                data[part] = {
                  collection: collectionName,
                  _id: processtools.ObjectId(_id)
                };
              }
              sortedRelationships[relation._data.type] ??= [];
              sortedRelationships[relation._data.type].push(data);
            }
          }
        }
        doc._relationships = sortedRelationships;
        if (typeOfRelationship === '*') {
          conditions = { _relationships: sortedRelationships };
          // update all -> slower
          if (options.doPersist) {
            __guard__(options != null ? options.debug : undefined, x => x.where.push(conditions));
            return doc.update(conditions, (err, result) => _finally(err,result,options));
          } else {
            return _finally(err,null,options);
          }
        } else {
          const key = '_relationships.'+typeOfRelationship;
          const update = {};
          update[key] = sortedRelationships[typeOfRelationship];
          conditions = update;
          __guard__(options != null ? options.debug : undefined, x1 => x1.where.push(conditions));
          if (sortedRelationships[typeOfRelationship] != null) {
            return doc.update(conditions, (err, result) => _finally(err,result,options));
          } else {
            // remove/unset attribute
            update[key] = 1; // used to get mongodb query like -> { $unset: { key: 1 } }
            conditions = { $unset: update };

            if (options.doPersist) {
              __guard__(options != null ? options.debug : undefined, x2 => x2.where.push(conditions));
              return doc.update(conditions, (err, result) => _finally(err,result,options));
            } else {
              return _finally(err,null,options);
            }
          }
        }
      });
    });
  };


  //### Private method to query neo4j directly
  //### options -> see Document::queryRelationships
  var _queryGraphDB = function(cypher, options, cb) {
    ({options,cb} = processtools.sortOptionsAndCallback(options,cb));
    // TODO: type check
    // try to "guess" process part from last statement
    // TODO: nice or bad feature?! ... maybe too much magic
    if ((options.processPart == null) && __guard__(cypher.trim().match(/(RETURN|DELETE)\s+([a-zA-Z]+?)[;]*$/), x => x[2])) {
      options.processPart = cypher.trim().match(/(RETURN|DELETE)\s+([a-zA-Z]+?)[;]*$/)[2];
    }
    return graphdb.query(cypher, null, function(errGraph, map) {
      // Adding cypher query for better debugging
      if (options.debug === true) { options.debug = {}; }
      if (options.debug != null) {
        options.debug.cypher ??= [];
      }
      __guard__(options.debug != null ? options.debug.cypher : undefined, x1 => x1.push(cypher));
      options.loadDocuments ??= true; // load documents from mongodb
      // TODO: would it be helpful to have also the `native` result?
      // options.graphResult = map
      if (options.loadDocuments && ((map != null ? map.length : undefined) > 0)) {
        // extract from result
        const data = map.map((result) =>
          options.processPart ?
            result[options.processPart]
          :
            // return first first property otherwise
            result[Object.keys(result)[0]]);
        if (processtools.constructorNameOf(data[0]) === 'Relationship') {
          return processtools.populateResultWithDocuments(data, options, cb);
        // TODO: distinguish between 'Path', 'Node' etc ...
        } else {
          return processtools.populateResultWithDocuments(data, options, cb);
        }
      } else {
        // prevent `undefined is not a function` if no cb is given
        if (typeof cb === 'function') { return cb(errGraph, map || null, options); }
      }
    });
  };

  //### Cache node
  if (globalOptions.cacheAttachedNodes) {
    return Document.prototype._cached_node = null;
  }
};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}