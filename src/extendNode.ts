// @ts-nocheck
// ### Extend Neo4j
//
// This models extends the Node object of the neo4j module with:
// * get the collectionname and _if of the mongodb document
// * load the corresponding document from mongodb

const processtools = require('./processtools');

module.exports = function(globalOptions) {

  const {
    mongoose
  } = globalOptions;
  const graphdb  = globalOptions.neo4j;

  processtools.setNeo4j(graphdb);

  //### Adding document methods on node(s)

  // Is needed for prototyping
  const node = graphdb.createNode();
  const Node = node.constructor;

  // Check that we don't override existing functions
  if (globalOptions.overrideProtoypeFunctions !== true) {
    for (var functionName of [ 'getDocument', 'getMongoId', 'getCollectionName' ]) {
      if (typeof node.constructor.prototype[functionName] !== 'undefined') { throw new Error(`Will not override neo4j::Node.prototype.${functionName}`); }
    }
  }

  //### Loads corresponding document from given node object
  const _loadDocumentFromNode = function(node, cb) {
    if (!__guard__(node != null ? node._data : undefined, x => x.data)) { return cb("No node object given", cb); }
    const _id =  new processtools.getObjectIdFromString(node.getMongoId());
    const collectionName = node.getCollectionName();
    if (typeof cb !== 'function') { cb(new Error("No cb given", null)); }
    // we need to query the collection natively here
    // TODO: find a more elegant way to access models instead of needing the "registerModels" way...
    const collection = processtools.getCollectionByCollectionName(collectionName, mongoose);
    return collection.findOne({ _id }, cb);
  };

  //### Loads corresponding document from given neo4j url 
  const _loadDocumentFromNodeUrl = (url, cb) => graphdb.getNode(url, function(err, node) {
    if (err) { return cb(err, node); } 
    return _loadDocumentFromNode(node, cb);
  });

  //### Returns the name of the collection from indexed url or from stored key/value
  Node.prototype.getCollectionName = function() {
    // try to extract collection from url (indexed namespace)
    // TODO: better could be via parent document if exists
    // indexed: 'http://localhost:7474/db/data/index/node/people/_id/516123bcc86e28485e000007/755' }
    return __guard__(__guard__(this._data != null ? this._data.indexed : undefined, x1 => x1.match(/\/data\/index\/node\/(.+?)\//)), x => x[1]) || (this._data != null ? this._data.data._collection : undefined);
  };

  //### Returns the mongodb document _id from stored key/value
  Node.prototype.getMongoId = function() {
    // TODO: sometimes node doen't include the data -> would need extra call
    // e.g.: _data: { self: 'http://localhost:7474/db/data/node/X' } }
    return __guard__(this._data != null ? this._data.data : undefined, x => x._id);// or null
  };

  //### Loads the node's corresponding document from mongodb
  return Node.prototype.getDocument = function(cb) {
    if (this.document && (typeof cb === 'function')) { return cb(null, this.document); }
    // Native mongodb call, so we need the objectid as object
    if (__guard__(this._data != null ? this._data.data : undefined, x => x._id)) {
      return _loadDocumentFromNode(this, cb);
    } else {
      return _loadDocumentFromNodeUrl(this._data != null ? this._data.self : undefined, cb);
    }
  };
};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}