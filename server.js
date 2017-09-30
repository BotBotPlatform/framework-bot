var express = require('express');
module.exports.basePath = __filename;

var app = express();
var handleQuery = require('./database.js').handleQuery;


//Check for port
var portNumber = process.argv[2];
if(!portNumber) {
    console.log("Error: missing port number!");
    return process.exit();
}

app.get('/',(req,res) => {
  handleQuery("select * from bots")
  .then((data) => {
    return res.send(data.result);
  }).catch((err) => {
    return res.send(err);
  });
});

app.listen(portNumber,(err) => {
  if(!err) {
    console.log("Bot server is up on port " + portNumber);
  } else {
    console.log("Error starting server on port " + portNumber+"! Error is: \n"+err);
  }
});
