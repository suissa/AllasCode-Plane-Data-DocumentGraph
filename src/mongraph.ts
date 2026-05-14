// @ts-nocheck
const processtools = require('./processtools');
const mongraphMongoosePlugin = require('./mongraphMongoosePlugin');
const _ = require('underscore');
const { Semantic } = require('./semanticTypes');

// bare config 
const config = { options: {} };
let alreadyInitialized = false;

const init = function(options) {

  if (typeof options !== 'object') { options = {}; }
  const atomicOptions = Semantic.graphConfig(options);
  atomicOptions.validate();
  options = atomicOptions.value;

  // set default options
  _.extend(config.options, options);
  config.mongoose = options.mongoose;
  config.graphdb  = options.neo4j;
  config.options.overrideProtypeFunctions ??= false;
  config.options.storeDocumentInGraphDatabase = false; // TODO: implement
  config.options.cacheNodes ??= true;
  config.options.loadMongoDBRecords ??= true;
  config.options.extendSchemaWithMongoosePlugin ??= true;
  config.options.relationships ??= {};
  const atomicRelationships = Semantic.relationshipOptions(config.options.relationships);
  atomicRelationships.validate();
  config.options.relationships = atomicRelationships.value;
  config.options.relationships.storeTimestamp ??= true;
  config.options.relationships.storeIDsInRelationship = true; // must be true as long it's needed for mongraph to work as expected 
  config.options.relationships.bidirectional ??= false;
  config.options.relationships.storeInDocument ??= false; // will produce redundant data (stored in relationships + document)
  config.options.cacheAttachedNodes ??= true; // recommend to decrease requests to neo4j

  // Allow overriding if mongrapg already was inizialized
  if (alreadyInitialized) { config.options.overrideProtoypeFunctions = true; }
  
  // used for extendDocument + extendNode
  config.options.mongoose = options.mongoose;
  config.options.graphdb  = options.neo4j;

  if (processtools.constructorNameOf(config.mongoose) !== 'Mongoose') { throw new Error("mongraph needs a mongoose reference as parameter"); }
  if (processtools.constructorNameOf(config.graphdb) !== 'GraphDatabase') { throw new Error("mongraph needs a neo4j graphdatabase reference as paramater"); }

  // extend Document(s) with Node/GraphDB interoperability
  require('./extendDocument')(config.options);
  // extend Node(s) with DocumentDB interoperability
  require('./extendNode')(config.options);

  // Load plugin and extend schemas with middleware
  // -> http://mongoosejs.com/docs/plugins.html
  if (config.options.extendSchemaWithMongoosePlugin) { config.mongoose.plugin(mongraphMongoosePlugin, config.options); }

  return alreadyInitialized = true;
};


module.exports = {init,config,processtools};

