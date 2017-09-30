var mysql = require('mysql');
var basePath = require('./server.js').basePath;
require('dotenv').config({path: basePath+"/../.env"});
console.log(basePath);

var connection = mysql.createConnection({
  host     : process.env.DB_HOST,
  database : process.env.DB_DATABASE,
  user     : process.env.DB_USER,
  password : process.env.DB_PASSWORD
});

var pool      =    mysql.createPool({
    connectionLimit : 10, //important
    host     : process.env.DB_HOST,
    database : process.env.DB_DATABASE,
    user     : process.env.DB_USER,
    password : process.env.DB_PASSWORD,
    debug    :  true
});

connection.connect(function(err) {
  if (err) {
    console.error('error connecting: ' + err.stack);
    return;
  }
});

module.exports.handleQuery = function(queryString) {
    return new Promise((resolve, reject) => {

      //Try to get a connection
      pool.getConnection(function(err,conn){
        if(err) {
          reject({status: "no_connection", message: err});
        }

      //Execute query
      conn.query(queryString,function(error,rows) {
        conn.release();
        if(err) {
          reject({status: "query_failed", message: error});
        } else {
          resolve({status: "success", result: rows});
        }
      });

    });
  });
}
