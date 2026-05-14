// @ts-nocheck
let nodesCountBefore;
const args         = require('minimist')(process.argv.slice(2));

let neo4jPort    = args.globals || 7474;
neo4jPort    = (Number)(neo4jPort);

const neo4jURL     = `http://localhost:${neo4jPort}`;
const mongodbURL   = 'mongodb://localhost/mongraph_test';

const expect       = require('expect.js');
const mongoose     = require('mongoose');
const neo4j        = require('neo4j');
const mongraph     = require("../src/mongraph");
// remove all test-created nodes on every test run
const cleanupNodes = false;
const nodesCount   = (nodesCountBefore = 0); // used to check that we have deleted all created nodes during tests
const Join         = require('join');
const request      = require('request');

describe("Mongraph", function() {

  let alice, bar, bob, charles, dave, elton, frank, graph, Location, Message, pub, zoe;
  const _countNodes = cb => graph.query("START n=node(*) RETURN count(n)", (err, count) => cb(err, Number(__guard__(count != null ? count[0] : undefined, x => x['count(n)'])) || null));

  // schemas and data objects
  let Person = (Location = (Message = (alice = (bob = (charles = (dave = (elton = (frank = (zoe = (bar = (pub = null)))))))))));
  // handler for connections
  const mongo  = (graph = null);
  // regex for validating objectid
  const regexID = /^[a-f0-9]{24}$/;

  before(function(done) {

    console.log(`    -> Testing against '${neo4jURL}' (neo4j) and '${mongodbURL}' (mongodb)`);

    // Establish connections to mongodb + neo4j
    graph = new neo4j.GraphDatabase(neo4jURL);
    mongoose.connect(mongodbURL);

    // initialize mongraph
    mongraph.init({
      neo4j: graph,
      mongoose
    });
    
    // Define model
    const personSchema  = new mongoose.Schema({name: String});
    // for testing nesting and node storage
    const messageSchema = new mongoose.Schema({
      message: {
        title: {
          type: String,
          index: true,
          graph: true
        },
        content: String
      },
      from: {
        type: String,
        graph: true
      },
      my_id: {
        type: Number,
        index: true,
        graph: true
      }
    });

    // is used for checking that we are working with the mongoose model and not with native mongodb objects
    personSchema.virtual('fullname').get(function() { if (this.name) { return this.name+" "+this.name[0]+"."; } });

    Person   = mongoose.model("Person", personSchema);
    Location = mongoose.model("Location", mongoose.Schema({name: String, lon: Number, lat: Number}));
    Message  = mongoose.model("Message", messageSchema);

    alice   = new Person({name: "alice"});
    bob     = new Person({name: "bob"});
    charles = new Person({name: "charles"});
    zoe     = new Person({name: "zoe"});

    bar     = new Location({name: "Bar", lon: 52.51, lat: 13.49});
    pub     = new Location({name: "Pub", lon: 40, lat: 10});

    const createExampleDocuments = cb => // create + store documents
    alice.save(
      () => bob.save(() => charles.save(() => zoe.save(() => bar.save(() => pub.save(() => cb())))))
    );

    if (cleanupNodes) {
      // remove all records
      return _countNodes(function(err, count) {
        nodesCountBefore = count;
        return Person.remove(() => Location.remove(() => createExampleDocuments(() => done())));
      });
    } else {
      return Person.remove(() => Location.remove(() => createExampleDocuments(() => createExampleDocuments(() => done()))));
    }
  });

  beforeEach(done => // remove all relationships
  alice.removeRelationships(
    '*',
    () => bob.removeRelationships('*', () => zoe.removeRelationships('*', () => bar.removeRelationships('*', () => pub.removeRelationships('*', () => // **knows**
    // alice -> bob -> charles -> zoe
    // bob -> zoe
    // alice <- zoe
    // **visits*
    // alice -> bar
    // alice -> pub
    alice.createRelationshipTo(
      bob,
      'knows',
      { since: 'years' },
      () => alice.createRelationshipFrom(zoe, 'knows', { since: 'months' }, () => bob.createRelationshipTo(charles, 'knows', () => charles.createRelationshipTo(zoe, 'knows', () => bob.createRelationshipTo(zoe, 'knows', () => alice.createRelationshipTo(bar, 'visits', () => alice.createRelationshipTo(pub, 'visits', () => done()))))))
    )))))
  ));
  after(function(done) {
    if (!cleanupNodes) { return done(); }
    // Remove all persons and locations with documents + nodes
    const join = Join.create();
    for (var record of [ alice, bob, charles, dave, elton, zoe, bar, pub ]) {
      (function(record) {
        const callback = join.add();
        if (typeof (record != null ? record.remove : undefined) === 'function') {
          return record.remove(callback);
        } else {
          return callback();
        }
      })(record);
    }
    return join.when((a, b) => _countNodes(function(err, count) {
      if (nodesCountBefore !== count) {
        return done(new Error(`Mismatch on nodes counted before (${nodesCountBefore}) and after (${count}) tests`));
      } else {
        return done();
      }
    }));
  });

  describe('processtools', function() {

    describe('#getObjectIDAsString()', () => it('expect to extract the id from various kind of argument types', function() {
      expect(mongraph.processtools.getObjectIDAsString(alice)).to.match(regexID);
      expect(mongraph.processtools.getObjectIDAsString(alice._id)).to.match(regexID);
      return expect(mongraph.processtools.getObjectIDAsString(String(alice._id))).to.match(regexID);
    }));

    describe('#getCollectionByCollectionName()', () => it('expect to get the collection object by collection name', function() {
      const collection = mongraph.processtools.getCollectionByCollectionName('people');
      return expect(collection.constructor).to.be.an(Object);
    }));

    describe('#getModelByCollectionName()', () => it('expect to get the model object by collection name', function() {
      const model = mongraph.processtools.getModelByCollectionName('people');
      return expect(model).to.be.an(Object);
    }));

    describe('#getModelNameByCollectionName()', () => it('expect to get the model object by collection name', function() {
      const modelName = mongraph.processtools.getModelNameByCollectionName('people');
      return expect(modelName).to.be.equal('Person');
    }));

    describe('#sortTypeOfRelationshipAndOptionsAndCallback()', () => it('expect to sort arguments', function() {
      const fn = mongraph.processtools.sortTypeOfRelationshipAndOptionsAndCallback;
      const cb = function() {};
      let result = fn();
      expect(result).be.eql({ typeOfRelationship: '*', options: {}, cb: undefined });
      result = fn(cb);
      expect(result).be.eql({ typeOfRelationship: '*', options: {}, cb });
      result = fn('knows', cb);
      expect(result).be.eql({ typeOfRelationship: 'knows', options: {}, cb });
      result = fn({debug: true}, cb);
      expect(result).be.eql({ typeOfRelationship: '*', options: { debug: true }, cb });
      result = fn('knows', {debug: true}, cb);
      return expect(result).be.eql({ typeOfRelationship: 'knows', options: { debug: true }, cb });
  }));

    return describe('#populateResultWithDocuments()', function() {

      it('expect to get an error and null with options as result if the data is not usable', done => mongraph.processtools.populateResultWithDocuments(null, { test: true }, function(err, data, options) {
        expect(err).to.be.an(Error);
        expect(data).to.be.null;
        expect(options).to.be.an(Object);
        expect(options).to.have.keys('test');
        return done();
      }));

      it('expect to get a node populated with the corresponding document', function(done) {
        const _id = String(alice._id);
        const node = graph.createNode({ _collection: 'people', _id });
        return node.save(function(err, storedNode) {
          expect(err).to.be(null);
          expect(storedNode).to.be.a(node.constructor);
          return mongraph.processtools.populateResultWithDocuments(storedNode, { referenceDocumentId: _id }, function(err, populatedNodes, options) {
            expect(err).to.be(null);
            expect(populatedNodes).to.have.length(1);
            expect(populatedNodes[0].document).to.be.a('object');
            expect(String(populatedNodes[0].document._id)).to.be.equal(_id);
            return storedNode.delete(() => done()
            , true);
          });
        });
      });

      it('expect to get relationships populated with the corresponding documents', function(done) {
        const _fromID         = String(alice._id);
        const _toID           = String(bob._id);
        const collectionName  = alice.constructor.collection.name;
        const from            = graph.createNode({ _collection: 'people', _id: _fromID });
        const to              = graph.createNode({ _collection: 'people', _id: _toID });
        return from.save((err, fromNode) => to.save((err, toNode) => fromNode.createRelationshipTo(toNode, 'connected', { _from: collectionName+":"+_fromID, _to: collectionName+":"+_toID }, function(err) {
          expect(err).to.be(null);
          return toNode.incoming('connected', function(err, foundRelationships) {
            expect(foundRelationships).to.have.length(1);
            return mongraph.processtools.populateResultWithDocuments(foundRelationships, function(err, populatedRelationships) {
              expect(err).to.be(null);
              expect(populatedRelationships).to.have.length(1);
              expect(populatedRelationships[0].from).to.be.an(Object);
              expect(populatedRelationships[0].start).to.be.an(Object);
              expect(String(populatedRelationships[0].from._id)).to.be.equal(_fromID);
              expect(String(populatedRelationships[0].to._id)).to.be.equal(_toID);
              return fromNode.delete(() => toNode.delete(() => done()
              , true)
              , true);
            });
          });
        })));
      });

      const _createExamplePath = function(cb) {
        const _fromID         = String(alice._id);
        const _throughID      = String(bob._id);
        const _toID           = String(pub._id);
        const people          = alice.constructor.collection.name;
        const locations       = pub.constructor.collection.name;
        const from            = graph.createNode({ _collection: 'people', _id: _fromID });
        const through         = graph.createNode({ _collection: 'people', _id: _throughID });
        const to              = graph.createNode({ _collection: 'locations', _id: _toID });
        return from.save((err, fromNode) => through.save((err, throughNode) => to.save((err, toNode) => fromNode.createRelationshipTo(throughNode, 'connected', { _from: people+':'+_fromID,    _to: people+':'+_throughID }, err => throughNode.createRelationshipTo(toNode, 'connected', { _from: people+':'+_throughID, _to: locations+':'+_toID }, function(err) {
          const query = `\
START  a = node(${fromNode.id}), b = node(${toNode.id}) 
MATCH  p = shortestPath( a-[:connected*..3]->b )
RETURN p;\
`;
          return graph.query(query, (err, result) => cb(err, result, [ fromNode, toNode, throughNode ]));
        })))));
      };

      const _removeExampleNodes = function(nodes, cb) {
        const join = Join.create();
        const ids = nodes.map((node) =>
          node.id);
        return graph.query(`START n = node(${ids.join(",")}) MATCH n-[r?]-() DELETE n, r`, err => cb(null, null));
      };

      it('expect to get path populated w/ corresponding documents', done => _createExamplePath(function(err, result, exampleNodes) {
        expect(err).to.be(null);
        expect(result).to.have.length(1);
        const options = { debug: true, processPart: 'p' };
        return mongraph.processtools.populateResultWithDocuments(result, options, function(err, populatedPath, options) {
          expect(populatedPath).to.have.length(3);
          return _removeExampleNodes(exampleNodes, () => done());
        });
      }));

      it('expect to get path populated w/ corresponding documents with query', done => _createExamplePath(function(err, result, exampleNodes) {
        const options = {
          debug: true,
          processPart: 'p',
          where: {
            document: { name: /^[A-Z]/ }
          }
        };
        return mongraph.processtools.populateResultWithDocuments(result, options, function(err, populatedPath, options) {
          expect(populatedPath).to.have.length(1);
          expect(populatedPath[0].name).match(/^[A-Z]/);
          return _removeExampleNodes(exampleNodes, () => done());
        });
      }));

      return it('expect to get path populated w/ corresponding documents with distinct collection', done => _createExamplePath(function(err, result, exampleNodes) {
        const options = {
          debug: true,
          processPart: 'p',
          collection: 'locations'
        };
        return mongraph.processtools.populateResultWithDocuments(result, options, function(err, populatedPath, options) {
          expect(populatedPath).to.have.length(1);
          expect(populatedPath[0].name).to.be.equal('Pub');
          return _removeExampleNodes(exampleNodes, () => done());
        });
      }));
    });
  });

  
  describe('mongraph', () => describe('#init()', () => it('expect that we have the all needed records in mongodb', function(done) {
    const persons = [];
    return Person.count(function(err, count) {
      expect(count).to.be.equal(4);
      return Location.count(function(err, count) {
        expect(count).to.be.equal(2);
        return done();
      });
    });
  })));

  describe('mongraphMongoosePlugin', () => describe('#schema', function() {

    it('expect to have extra attributes reserved for use with neo4j', function(done) {
      const p = new Person({name: 'Person'});
      return p.save(function(err, doc) {
        expect(doc._node_id).to.be.above(0);
        // checks that we can set s.th.
        doc._relationships = {id: 1};
        expect(doc._relationships.id).to.be.equal(1);
        return p.remove(() => done());
      });
    });

    return it('expect that schema extensions and hooks can be optional', function(done) {
      const calledPreSave = false;

      const join = Join.create();
      const doneDisabled     = join.add();
      
      let schema   = new mongoose.Schema({name: String});
      schema.set('graphability', false);
      const Guitar   = mongoose.model("Guitar",   schema);
      const guitar   = new Guitar({name: 'Fender'});
      guitar.save(function(err, doc) {
        expect(err).to.be(null);
        expect(doc._node_id).to.be(undefined);
        return doc.getNode(function(err, node) {
          expect(err).not.to.be(null);
          expect(node).to.be(null);
          return doc.remove(() => doneDisabled());
        });
      });

      const doneNoDeleteHook = join.add();
      schema   = new mongoose.Schema({name: String});
      schema.set('graphability', {middleware: {preRemove: false}});
      const Keyboard = mongoose.model("Keyboard", schema);
      const keyboard = new Keyboard({name: 'DX7'});
      keyboard.save((err, doc) => doc.getNode((err, node) => // we have to delete the node manually becaud we missed out the hook
      doc.remove(() => graph.getNodeById(node.id, function(err, foundNode) {
        expect(node).to.be.an('object');
        return node.delete(() => doneNoDeleteHook());
      }))));

      // doneNoSaveHook   = join.add()
      // schema   = new mongoose.Schema name: String
      // schema.set 'graphability', middleware: preSave: false
      // # explicit overriding middleware
      // schema.pre 'save', (next) ->
      //   calledPreSave = true
      //   next()
      
      // Drumkit  = mongoose.model "Drumkit",  schema
      // drums    = new Drumkit name: 'Tama'
      // drums.save (err, doc) ->
      //   expect(err).to.be null
      //   expect(calledPreSave).to.be true
      //   expect(doc._cached_node).not.be.an 'object'
      //   drums.remove ->
      //     doneNoSaveHook()

      return join.when(() => done());
    });
  }));


  describe('mongoose::Document', function() {

    describe('#getNode()', function() {

      it('expect not to get a corresponding node for an unstored document in graphdb', function(done) {
        elton = Person({name: "elton"});
        expect(elton._node_id).not.to.be.above(0);
        return elton.getNode(function(err, found) {
          expect(err).not.to.be(null);
          expect(found).to.be(null);
          return done();
        });
      });

      it('expect to find always the same corresponding node to a stored document', function(done) {
        elton = Person({name: "elton"});
        return elton.save(function(err, elton) {
          expect(err).to.be(null);
          const nodeID = elton._node_id;
          expect(nodeID).to.be.above(0);
          return elton.getNode(function(err, node) {
            expect(err).to.be(null);
            expect(node.id).to.be.equal(node.id);
            if (cleanupNodes) { elton.remove(); }
            return done();
          });
        });
      });

      return it('expect to find a node by collection and _id through index on neo4j', done => graph.getIndexedNode('people', '_id', alice._id, function(err, found) {
        expect(found.id).to.be.equal(alice._node_id);
        return done();
      }));
    });

    describe('#createRelationshipTo()', () => it('expect to create an outgoing relationship from this document to another document', done => alice.createRelationshipTo(bob, 'knows', { since: 'years' }, function(err, relationship) {
      expect(relationship[0].start.data._id).to.be.equal((String)(alice._id));
      expect(relationship[0].end.data._id).to.be.equal((String)(bob._id));
      expect(relationship[0]._data.type).to.be.equal('knows');
      return alice.createRelationshipTo(zoe, 'knows', { since: 'years' }, function(err, relationship) {
        expect(relationship[0].start.data._id).to.be.equal((String)(alice._id));
        expect(relationship[0].end.data._id).to.be.equal((String)(zoe._id));
        expect(relationship[0]._data.type).to.be.equal('knows');
        return done();
      });
    })));

    describe('#createRelationshipFrom()', () => it('expect to create an incoming relationship from another document to this document' , done => bob.createRelationshipFrom(zoe, 'knows', { since: 'years' }, function(err, relationship) {
      expect(relationship[0].start.data._id).to.be.equal((String)(zoe._id));
      expect(relationship[0].end.data._id).to.be.equal((String)(bob._id));
      return done();
    })));

    describe('#createRelationshipBetween()', () => it('expect to create a relationship between two documents (bidirectional)', done => alice.createRelationshipBetween(bob, 'follows', () => bob.allRelationships('follows', function(err, bobsRelationships) {
      const value = null;
      let hasIncoming = false;
      let hasOutgoing = false;
      for (var relationship of bobsRelationships) {
        if (!hasOutgoing) { hasOutgoing = (relationship.from.name === 'bob') && (relationship.to.name   === 'alice'); }
        if (!hasIncoming) { hasIncoming = (relationship.to.name   === 'bob') && (relationship.from.name === 'alice'); }
      }
      expect(hasOutgoing).to.be(true);
      expect(hasIncoming).to.be(true);
      return done();
    }))));


    describe('#removeRelationshipsTo', () => it('expect to remove outgoing relationships to a document', done => // zoe gets to follow bob
    zoe.createRelationshipTo(bob, 'follows', function(err, relationship) {
      expect(err).to.be(null);
      // zoe follows bob
      return zoe.outgoingRelationships('follows', function(err, follows) {
        expect(err).to.be(null);
        expect(follows).to.have.length(1);
        expect(follows[0].to.name).to.be.equal('bob');
        // zoe stops all 'follow' activities
        return zoe.removeRelationshipsTo(bob, 'follows', function(err, a) {
          expect(err).to.be(null);
          return zoe.outgoingRelationships('follows', function(err, follows) {
            expect(err).to.be(null);
            expect(follows).to.have.length(0);
            return done();
          });
        });
      });
    })));

    describe('#removeRelationshipsFrom', () => it('expects to remove incoming relationships from a document', done => alice.incomingRelationships('knows', function(err, relationships) {
      const countBefore = relationships.length;
      expect(relationships.length).to.be.equal(1);
      expect(relationships[0].from.name).to.be.equal('zoe');
      return alice.removeRelationshipsFrom(zoe, 'knows', function(err, query, options) {
        expect(err).to.be(null);
        return alice.incomingRelationships('knows',function(err, relationships) {
          expect(relationships.length).to.be.equal(0);
          return done();
        });
      });
    })));

    describe('#removeRelationshipsBetween', () => it('expects to remove incoming and outgoing relationships between two documents', done => // alice <-knows-> zoe
    alice.removeRelationships(
      'knows',
      () => zoe.removeRelationships('knows', () => alice.createRelationshipTo(zoe, 'knows', () => zoe.createRelationshipTo(alice, 'knows', err => alice.incomingRelationships('knows', function(err, relationships) {
        const aliceCountBefore = relationships.length;
        return zoe.incomingRelationships('knows', function(err, relationships) {
          const zoeCountBefore = relationships.length;
          expect(relationships[0].from.name).to.be.equal('alice');
          return zoe.removeRelationshipsBetween(alice, 'knows', function(err) {
            expect(err).to.be(null);
            return alice.incomingRelationships('knows', function(err, aliceRelationships) {
              expect(aliceRelationships.length).to.be.below(aliceCountBefore);
              return zoe.incomingRelationships('knows', function(err, zoeRelationships) {
                expect(zoeRelationships.length).to.be.below(zoeCountBefore);
                return done();
              });
            });
          });
        });
      }))))
    )));

    describe('#removeRelationships', function() {

      it('expects to remove all incoming and outgoing relationships', done => alice.allRelationships('knows', function(err, relationships) {
        expect(relationships.length).to.be.above(0);
        return alice.removeRelationships('knows', function(err) {
          expect(err).to.be(null);
          return alice.allRelationships('knows', function(err, relationships) {
            expect(relationships).to.have.length(0);
            return done();
          });
        });
      }));

      return it('expect to remove all relationship of a specific type', done => alice.allRelationships('knows', function(err, relationships) {
        expect(relationships != null ? relationships.length : undefined).be.above(0);
        return alice.removeRelationships('knows', function(err, relationships) {
          expect(relationships).to.have.length(0);
          return done();
        });
      }));
    });

    describe('#allRelationships()', function() {

      it('expect to get incoming and outgoing relationships as relationship object', done => alice.allRelationships('knows', function(err, relationships) {
        expect(relationships).to.be.an('array');
        expect(relationships).to.have.length(2);
        expect(relationships[0].data.since).to.be.equal('years');
        return done();
      }));

      it('expect to get all related documents attached to relationships', done => alice.allRelationships('knows', function(err, relationships) {
        expect(relationships).to.be.an('array');
        expect(relationships).to.have.length(2);
        expect(relationships[0].from).to.be.an('object');
        expect(relationships[0].to).to.be.an('object');
        const data = {};
        for (var relationship of relationships) {
          data[relationship.to.name] = true;
        }
        expect(data).to.only.have.keys( 'alice', 'bob' );
        return done();
      }));

      return it('expect to count all matched relationships, nodes or both', done => alice.allRelationships({ countDistinct: 'a', debug: true }, function(err, res, options) {
        const count = res[0];
        expect(count).to.be.above(0);
        return alice.allRelationships({ count: 'a', debug: true }, function(err, res, options) {
          expect(res[0]).to.be.above(count);
          return alice.allRelationships({ count: '*' }, function(err, resnew, options) {
            expect(resnew >= res[0]).to.be(true);
            return done();
          });
        });
      }));
    });

    describe('#allRelationshipsBetween()', function() {

      it('expect to get all relationships between two documents', done => // create bidirectional relationship
      bob.createRelationshipTo(
        alice,
        'knows',
        { since: 'years' },
        () => alice.allRelationshipsBetween(bob, 'knows', function(err, found) {
          expect(found).to.have.length(2);
          const from_a = found[0].from.name;
          const from_b = found[1].from.name;
          expect(from_a !== from_b).to.be(true);
          return done();
        })
      ));

      it('expect to get outgoing relationships between two documents', done => // create bidirectional relationship
      bob.createRelationshipTo(
        alice,
        'knows',
        { since: 'years' },
        () => alice.allRelationshipsBetween(bob, 'knows', (err, found) => alice.outgoingRelationshipsTo(bob, 'knows', function(err, found) {
          expect(found).to.have.length(1);
          return bob.outgoingRelationshipsTo(alice, 'knows', function(err, found) {
            expect(found).to.have.length(1);
            return done();
          });
        }))
      ));

      return it('expect to get incoming relationships between two documents', done => bob.createRelationshipTo(alice, 'knows', { since: 'years' }, () => alice.allRelationshipsBetween(bob, 'knows', (err, found) => alice.incomingRelationshipsFrom(bob, 'knows', function(err, found) {
        expect(found).to.have.length(1);
        return bob.incomingRelationshipsFrom(alice, 'knows', function(err, found) {
          expect(found).to.have.length(1);
          return done();
        });
      }))));
    });

    describe('#outgoingRelationships()', function() {

      it('expect to get outgoing relationships+documents from a specific collection', done => alice.outgoingRelationships('*', { collection: 'locations' }, function(err, relationships, options) {
        const data = {};
        for (var relationship of relationships) {
          data[relationship.to.name] = true;
        }
        expect(data).to.only.have.keys( 'Bar', 'Pub' );
        expect(relationships).to.have.length(2);
        expect(err).to.be(null);
        return done();
      }));

      it('expect to get incoming relationships+documents with a condition', done => alice.outgoingRelationships('*', { where: { document: { name: /^[A-Z]/ } } }, function(err, relationships) {
        expect(relationships).to.have.length(2);
        const data = {};
        for (var relationship of relationships) {
          data[relationship.to.name] = true;
        }
        expect(data).to.only.have.keys( 'Bar', 'Pub' );
        return done();
      }));

      return it('expect to get only outgoing relationships', done => alice.outgoingRelationships('visits', function(err, result) {
        expect(err).to.be(null);
        expect(result).to.have.length(2);
        return done();
      }));
    });

    describe('#incomingRelationships()', function() {

      it('expect to get only incoming relationships', done => alice.incomingRelationships('knows', function(err, result) {
        expect(err).to.be(null);
        expect(result).to.have.length(1);
        expect(result[0].data.since).be.equal('months');
        return done();
      }));

      return it('expect to get incoming relationships+documents from a specific collection', done => alice.incomingRelationships('*', { collection: 'people' }, function(err, relationships) {
        expect(relationships).to.have.length(1);
        expect(relationships[0].from.name).to.be('zoe');
        return done();
      }));
    });

    describe('#removeNode()', () => it('expect to remove a node including all incoming and outgoing relationships', function(done) {
      frank = new Person({name: 'frank'});
      return frank.save((err, frank) => frank.getNode(function(err, node) {
        const nodeId = node.id;
        expect(nodeId).to.be.above(0);
        return frank.createRelationshipTo(zoe, 'likes', () => zoe.createRelationshipTo(frank, 'likes', () => frank.allRelationships('likes', function(err, likes) {
          expect(likes).to.have.length(2);
          return frank.removeNode(function(err, result) {
            expect(err).to.be(null);
            return graph.getNodeById(nodeId, function(err, found) {
              expect(found).to.be(undefined);
              return frank.allRelationships('likes', function(err, likes) {
                expect(likes).to.be(null);
                if (cleanupNodes) { frank.remove(); }
                return done();
              });
            });
          });
        })));
      }));
    }));

    describe('#shortestPath()', function() {

      it('expect to get the shortest path between two documents', done => alice.shortestPathTo(zoe, 'knows', function(err, path) {
        expect(path).to.be.an('object');
        expect(err).to.be(null);
        const expectedPath = [ alice._id, bob._id, zoe._id ];
        for (let i = 0; i < path.length; i++) {
          var node = path[i];
          expect(String(node._id)).be.equal(String(expectedPath[i]));
        }
        return done();
      }));
      
      it('expect to get a mongoose document instead of a native mongodb document', done => alice.shortestPathTo(zoe, 'knows', function(err, path) {
        expect(path).to.have.length(3);
        expect(path[0].fullname).to.be.equal('alice a.');
        return done();
      }));

      return it('expect to get a mongoose document with conditions', done => alice.shortestPathTo(zoe, 'knows', { where: { document: { name: /o/ } } }, function(err, path) {
        bob = path[0];
        zoe = path[1];
        expect(bob.name).to.be.equal('bob');
        expect(zoe.name).to.be.equal('zoe');
        expect(path).to.have.length(2);
        return done();
      }));
    });

    describe('#dataForNode()', function() {

      it('expect to get null by default', function(done) {
        expect(alice.dataForNode()).to.be(null);
        const message = new Message();
        message.message = 'how are you?';
        return message.save(function() {
          const data = message.dataForNode();
          expect(data).to.have.property('message.title');
          expect(data).to.have.property('from');
          expect(data['from']).to.be(undefined);
          expect(data['message.title']).to.be(undefined);
          expect(Object.keys(data)).to.have.length(3);
          return message.remove(() => done());
        });
      });

      it('expect to get attributes for index', function(done) {
        const message = new Message();
        const index = message.dataForNode({index: true});
        expect(index).to.have.length(2);
        expect(index[0]).to.be.equal('message.title');
        expect(index[1]).to.be.equal('my_id');
        return done();
      });

      it('expect to delete values in document and on node', function(done) {
        const message = new Message();
        message.from = 'me';
        return message.save(() => message.getNode(function(err, node) {
          expect(node.data.from).to.be.equal('me');
          message.from = undefined;
          return message.save(() => message.getNode(function(err, node) {
            expect(node.data.from).to.be(undefined);
            return message.remove(() => done());
          }));
        }));
      });

      it('expect to get node with indexed fields from mongoose schema', function(done) {
        // TODO: use `graph.getIndexedNode` from neo4j module instead of manual request
        // Problem: currently getting no results from graph.getIndexedNode at all... maybe a bug in neo4j lib?!
        // first check didn't bring any progress... GraphDatabase._coffee @getIndexedNodes, response.body.map
        const value = new Date().getTime(); // generate 'unique' value for this test
        return graph.getIndexedNode('messages', 'my', value, function(err) {
          const message = new Message();
          message.message.title = '_'+value+'_';
          message.my_id = value;
          return message.save(() => graph.getIndexedNode('messages', 'my_id', value, (err, found) => request.get(neo4jURL+`/db/data/index/node/messages/my_id/${value}`, function(err, res) {
            expect(err).to.be(null);
            expect(res.body).to.be.a('string');
            const result = JSON.parse(res.body);
            expect(result[0].data['my_id']).to.be.equal(value);
            return message.remove(() => done());
          })));
        });
      });

      return it('expect to store values from document in corresponding node if defined in mongoose schema', function(done) {
        const message = new Message();
        message.message.content = 'how are you?';
        message.message.title = 'hello';
        message.from = 'me';
        return message.save(() => message.getNode(function(err, node) {
          expect(node).to.be.an('object');
          expect(node.data['message.title']).to.be.equal(message.message.title);
          expect(node.data.from).to.be.equal(message.from);
          expect(node.data['message.content']).to.be(undefined);
          return message.remove(() => done());
        }));
      });
    });

    describe('#init() with specific options', () => it('expect to store relationships (redundant) in document', done => alice.applyGraphRelationships({ doPersist: true }, function(err, relationships) {
      expect(err).to.be(null);
      expect(relationships).to.only.have.keys('knows', 'visits');
      expect(relationships.knows).to.have.length(2);
      //  remove all 'visits' relationships and check the effect on the record
      return alice.removeRelationships('visits', { debug: true }, (err, result, options) => alice.applyGraphRelationships({ doPersist: true }, function(err, relationships) {
        expect(err).to.be(null);
        expect(relationships).to.only.have.keys('knows');
        expect(relationships.knows).to.have.length(2);
        return Person.findById(alice._id, function(err, aliceReloaded) {
          expect(aliceReloaded._relationships).to.only.have.keys('knows');
          expect(aliceReloaded._relationships.knows).to.have.length(2);
          return done();
        });
      }));
    })));

    return describe('mongraph daily-use-test', done => it('expect to count relationships correctly (incoming, outgoing and both)', function(done) {
      dave  = new Person({name: 'dave'});
      elton = new Person({name: 'elton'});
      return elton.save(() => dave.save(() => elton.allRelationships(function(err, eltonsRelationships) {
        expect(err).to.be(null);
        expect(eltonsRelationships).to.have.length(0);
        return elton.createRelationshipTo(dave, 'rocks', { instrument: 'piano' }, () => elton.outgoingRelationships('rocks', function(err, playsWith) {
          expect(err).to.be(null);
          expect(playsWith).to.have.length(1);
          expect(playsWith[0].data.instrument).to.be('piano');
          return elton.incomingRelationships('rocks', function(err, playsWith) {
            expect(playsWith).to.have.length(0);
            return dave.createRelationshipTo(elton, 'rocks', { instrument: 'guitar' }, () => elton.incomingRelationships('rocks', function(err, playsWith) {
              expect(playsWith).to.have.length(1);
              return dave.createRelationshipTo(elton, 'rocks', { song: 'Everlong' }, () => elton.incomingRelationships('rocks', function(err, plays) {
                expect(plays).to.have.length(2);
                expect(plays[0].data.instrument).to.be('guitar');
                expect(plays[1].data.song).to.be('Everlong');
                return dave.allRelationships('*', (err, relations) => dave.allRelationships('*', { where: { relationship: "r.instrument = 'guitar'" }, debug: true }, function(err, relations, options) {                            
                  expect(relations).to.have.length(1);
                  expect(relations[0].data.instrument).to.be.equal('guitar');
                  if (cleanupNodes) {
                    return elton.remove(() => dave.remove(() => done()));
                  } else {
                    return done();
                  }
                }));
              }));
            }));
          });
        }));
      })));
    }));
  });

  return describe('Neo4j::Node', function() {

    describe('#getCollectionName()', () => it('expect to get the collection name from a node', function(done) {
      // create also a new node
      const emptyNode = graph.createNode();
      return alice.getNode(function(err, node) {
        expect(node.getCollectionName()).to.be.equal('people');
        expect(emptyNode.getCollectionName()).to.be(undefined);
        return done();
      });
    }));

    describe('#getMongoId()', () => it('expect to get the id of the corresponding document from a node', done => alice.getNode(function(err, node) {
      expect(node.getMongoId()).to.be.equal((String)(alice._id));
      return done();
    })));

    return describe('#getDocument()', () => it('expect to get equivalent document from a node', done => alice.getNode(function(err, node) {
      expect(node).to.be.an('object');
      return node.getDocument(function(err, doc) {
        expect(doc).to.be.an('object');
        expect(String(doc._id)).to.be.equal((String)(alice._id));
        return done();
      });
    })));
  });
});

      
    

      
    

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}