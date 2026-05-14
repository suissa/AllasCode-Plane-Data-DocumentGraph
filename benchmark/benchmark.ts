// @ts-nocheck
const sequence = require('futures').sequence.create();

sequence

  .then(function(next) {
    
    const {suite}  = require('./creating_records');

    suite.on("complete", function() {      
      console.log("\n**Fastest** is " + this.filter("fastest").pluck("name"));
      console.log("\n**Slowest** is " + this.filter("slowest").pluck("name"));
      console.log("\n");
      return next();
    });

    console.log("\n### CREATING RECORDS\n");
    return suite.run({async: true});}).then(function(next) {
    
    const {suite} = require('./finding_records');

    suite.on("complete", function() {      
      console.log("\n**Fastest** is " + this.filter("fastest").pluck("name"));
      console.log("\n**Slowest** is " + this.filter("slowest").pluck("name"));
      console.log("\n");
      return next();
    });

    console.log("\n### FINDING RECORDS\n");
    return suite.run({async: true});}).then(function(next) {
    
    const {suite} = require('./deleting_records');

    suite.on("complete", function() {      
      console.log("\n**Fastest** is " + this.filter("fastest").pluck("name"));
      console.log("\n**Slowest** is " + this.filter("slowest").pluck("name"));
      console.log("\n");
      return next();
    });

    console.log("\n### DELETING RECORDS\n");
    return suite.run({async: true});}).then(function(next) {
    
    console.log('done... exiting');
    return process.exit(0);
});
