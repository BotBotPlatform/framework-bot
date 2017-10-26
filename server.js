module.exports.basePath = __filename;

/**
  * Dependencies: dotenv, express, request, path,
    body-parser, database, morgan
  */
require('dotenv').config();
const express = require('express');
const request = require('request');
const path = require('path');
const bodyParser = require('body-parser');
//const handleQuery = require('./database.js').handleQuery;
const morgan = require('morgan');

/**
  * Create server to run bot application (bodyParser helps
    parse responses from Messenger)
  */
let app = express().use(morgan('dev')).use(bodyParser.json());

/**
  * Accept POST requests from Facebook
  */
app.post('/',(req,res) => {
  let body = req.body;

  if (body.object === 'page') {

    body.entry.forEach(function(entry) {
      if (entry.messaging[0]) {
        // Send to message handler for bot
        messageHandler(entry.messaging[0]);
      } else {
        console.log("Webhook received unknown event: ", entry);
      }
    });
    res.status(200).send('EVENT_RECEIVED');
  }
});

/**
  * Initiate feedback prompt
  * TODO: Payloads
  * TODO: Pull Titles from Feedback Categories w/ API
  */
function feedbackPrompt(sid) {
  var messageData = {
    recipient: {
      id: sid
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "What is your feedback related to?",
          buttons: [{
            type: "postback",
            title: "Customer Service",
            payload: "DEVELOPER_DEFINED_PAYLOAD"
          },{
            type: "postback",
            title: "Store Experience",
            payload: "DEVELOPER_DEFINED_PAYLOAD"
          },{
            type: "postback",
            title: "Shipping",
            payload: "DEVELOPER_DEFINED_PAYLOAD"
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

/**
  * Handle and direct messages
  * TODO: Setup other message handling features
  */
function messageHandler(msg) {
  if (!msg.delivery) {
    if (msg.message.text == 'feedback') {
      feedbackPrompt(msg.sender.id);
    }
  }  
}

/**
  * Send messages using Bot
  */
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: process.env.PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s", 
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });  
}

/**
  * Start server
  */
var server = app.listen(process.argv[2] || 4000, function () {
  console.log("BotBot listening on port %s", server.address().port);
});