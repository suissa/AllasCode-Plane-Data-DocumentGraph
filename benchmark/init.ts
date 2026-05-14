// @ts-nocheck
const Benchmark = require('benchmark');
// Suite     = Benchmark.Suite
// suite = new Benchmark.Suite

// mongoose
const mongoose   = require('mongoose');
mongoose.connect("mongodb://localhost/testdb");
const Person = mongoose.model("Person", {value: Number});

// "native"
const mongoskin = require("mongoskin");
const mongodb   = mongoskin.db("localhost:27017/testdb", {safe:false});

// neo4j
const neo4j  = require('neo4j');
const graph  = new neo4j.GraphDatabase('http://localhost:7474');

// mongraph
const mongraph   = require('../src/mongraph');  
mongraph.init({ neo4j: graph, mongoose });
// Location is not with mongraph hooks
const Location   = mongoose.model("Location", {value: Number});

const randomInteger = (floor = 0, ceiling = 1) => Math.round(Math.random()*(ceiling-floor))+floor;

const exports = (module.exports = {mongraph,graph,mongodb,randomInteger,Benchmark,Person,Location});