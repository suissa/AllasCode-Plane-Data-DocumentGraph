// @ts-nocheck
let exports, mongraphMongoosePlugin;
const _ = require('underscore');

module.exports = (exports = (mongraphMongoosePlugin = function(schema, options = {}) {

  const schemaOptions = schema.options;

  // skip if is set explizit to false
  if (schemaOptions.graphability === false) { return null; }

  // set default option values for graphability
  schemaOptions.graphability            ??= {};
  schemaOptions.graphability.schema     ??= true;
  schemaOptions.graphability.middleware ??= true;
    
  // set default values, both hooks
  if (schemaOptions.graphability.middleware && (typeof schemaOptions.graphability.middleware !== 'object')) { schemaOptions.graphability.middleware = {}; }
  schemaOptions.graphability.middleware.preRemove ??= true;
  schemaOptions.graphability.middleware.preSave   ??= true;
  schemaOptions.graphability.middleware.postInit  ??= true;

  schemaOptions.graphability.relationships ??= {};
  schemaOptions.graphability.relationships.removeAllOutgoing ??= true;
  schemaOptions.graphability.relationships.removeAllIncoming ??= true;

  if (schemaOptions.graphability.schema) {
    // node id of corresponding node
    schema.add(
      {_node_id: Number},
      // add an empty object as placeholder for relationships, use is optional
      schema.add({_relationships: {}}));
  }

  // Extend middleware for graph use

  if (schemaOptions.graphability.middleware.preRemove) {
    schema.pre('remove', function(next) {
      // skip remove node if no node id is set
      if (this._node_id < 0) { return next(null); }
      // Remove also all relationships
      const opts =
        {includeRelationships: schemaOptions.graphability.relationships.removeAllOutgoing && schemaOptions.graphability.relationships.removeAllOutgoing};
      return this.removeNode(opts, next);
    });
  }

  if (schemaOptions.graphability.middleware.preSave) {
    return schema.pre('save', true, function(next, done) {
      // Attach/Save corresponding node
      const doc = this;
      next();
      return doc.getNode({ forceCreation: true }, function(err, node) {
        // if we have fields to store in node and they have to be inde
        const dataForNode = doc.dataForNode();
        const index = doc.dataForNode({index: true});
        doc.indexGraph({ node }, function() {}); // TODO: implement exception handler
        if (dataForNode) {
          // console.log dataForNode, node.id
          node.data = _.extend(node.data, dataForNode);
          for (var path in dataForNode) {
            // delete a key/value if it has an undefined value
            if (typeof dataForNode[path] === 'undefined') { delete(node.data[path]); }
          }
          node.save(function() {});
        }
            // TODO: implement exception handler
        return done(err, node);
      });
    });
  }
}));

        
      

  


