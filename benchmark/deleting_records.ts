// @ts-nocheck
const {mongraph,graph,mongodb,randomInteger,Benchmark,Person,Location} = require('./init');

const suite = new Benchmark.Suite;

suite.add("deleting native mongodb documents", deferred => mongodb.collection("people").insert({value: Math.random()}, (err, document) => mongodb.collection("people").removeById(document._id, err => deferred.resolve()))
, {defer: true});

suite.add("deleting mongoose documents", function(deferred) {
  const foo = new Person({value: Math.random()});
  return foo.save((err, document) => foo.remove(err => deferred.resolve()));
}
, {defer: true});

suite.add("deleting neo4j nodes", function(deferred) {
  const node = graph.createNode({value: Math.random()});
  return node.save(() => node.delete(err => deferred.resolve()));
}
, {defer: true});

suite.add("deleting mongraph documents", function(deferred) {
  const bar = new Location({value: Math.random()});
  return bar.save((err, document) => bar.remove(err => deferred.resolve()));
}
, {defer: true});

suite.on("cycle", event => console.log("* "+String(event.target)));

const exports = (module.exports = {suite});