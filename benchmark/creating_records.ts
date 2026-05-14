// @ts-nocheck
const {mongraph,graph,mongodb,randomInteger,Benchmark,Person,Location} = require('./init');

const suite = new Benchmark.Suite;

suite.add("creating native mongodb documents", deferred => mongodb.collection("people").insert({value: Math.random()}, (err, document) => deferred.resolve())
, {defer: true});

suite.add("creating mongoose documents", function(deferred) {
  const foo = new Person({value: Math.random()});
  return foo.save((err, document) => deferred.resolve());
}
, {defer: true});

suite.add("creating neo4j nodes", function(deferred) {
  const node = graph.createNode({value: Math.random()});
  return node.save(() => deferred.resolve());
}
, {defer: true});

suite.add("creating mongraph documents", function(deferred) {
  const bar = new Location({value: Math.random()});
  return bar.save((err, document) => deferred.resolve());
}
, {defer: true});

suite.on("cycle", event => console.log("* "+String(event.target)));

const exports = (module.exports = {suite});