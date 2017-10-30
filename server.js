module.exports.basePath = __filename;

/**
  * Dependencies: dotenv, express, request, path,
    body-parser, database, morgan
  */
require('dotenv').config();
const express = require('express');
const request = require('request-promise');
const path = require('path');
const bodyParser = require('body-parser');
//const handleQuery = require('./database.js').handleQuery;
const morgan = require('morgan');

const feedbackTrigger = 'BBFeedback-';
// To keep track of <UUID>:<CATEGORY ID> for active users
var fbMap = {};

let pageAccessToken = '';

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
    console.log('Webhook received request: ' + JSON.stringify(body));
    body.entry.forEach(function(entry) {
      if (entry.messaging[0]) {
        if (entry.messaging[0].postback) {
          postbackHandler(entry.messaging[0])
        } else {
          // Send to message handler for bot
          messageHandler(entry.messaging[0], process.argv[3]);
        }
      } else {
        console.log("Webhook received unknown event: ", entry);
      }
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    console.log('Webhook received request with unknown body field: ' + JSON.stringify(body));
  }
});

/**
  * Initiate feedback prompt
  */
function feedbackPrompt(sid, token) {
  // Feedback needs user token
  if (!token) {
    console.log("Missing token for feedback prompt")
    return;
  }

  // Butttons array to hold feedback categories
  var buttons = [];

  callBotAPI('feedback', {
    method: 'GET'
  }, token)
  .then((res) => JSON.parse(res))
    .then((json) => {
      console.log("Got feedback categories from server, listing...");
      // Feedback categories, limited to first 3
      for (var f in json.feedback.slice(0,3)) {
        buttons = buttons.concat({
          type: 'postback',
          title: json.feedback[f].name,
          payload: feedbackTrigger + json.feedback[f].id.toString()
        });
      }

      // Message structure for FB
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
              buttons: buttons
            }
          }
        }
      };

      // Send message to user
      callSendAPI(messageData);
  });
}

/**
  * Sets <UUID>:<CATEGORY ID> in feedback map
  */
function setFeedbackCategory(user, category) {
  fbMap[user] = category;
}

function sendFeedback(sid, category, feedback) {
  callBotAPI('feedback', {
    method: 'POST',
    form: {category_id: category, message: feedback}
  }, null)
  .then((res) => JSON.parse(res))
    .then((json) => {
      if (json.message === 'success') {
        var messageData = {
          recipient: {
            id: sid
          },
          message: {
            text: 'Thanks for the feedback!'
          }
        };
        callSendAPI(messageData);
      }
    });
}

/**
  * Handle and direct messages
  * TODO: Setup other message handling features
  * TODO: Configure delivery messages for feedback
  */
function messageHandler(msg, token) {
  if (!msg.delivery) {
    console.log("Handling message: " + msg);
    if (fbMap[msg.sender.id]) {
      console.log("Sending feedback");
      sendFeedback(msg.sender.id, fbMap[msg.sender.id], msg.message.text.toString());
      delete fbMap[msg.sender.id];
    }
    if (msg.message.text == 'feedback') {
      console.log("Sending feedback prompt...");
      feedbackPrompt(msg.sender.id, token);
    }
  } else {
    console.log("Missing msg.delivery field");
  }
}

/**
  * Handles postbacks for user events, like button pressed
  */
function postbackHandler(postback) {
  let type = postback.postback.payload.toString();

  if (type.startsWith(feedbackTrigger)) {
    console.log("Setting feedback cateogry");
    setFeedbackCategory(postback.sender.id, type.replace(feedbackTrigger, ''));
    var messageData = {
      recipient: {
        id: postback.sender.id
      },
      message: {
        text: 'What\'s your feedback?'
      }
    };
    callSendAPI(messageData);
  }

}

/**
  * Send messages using Bot
  */
function callSendAPI(messageData) {
  console.log("Sending message to fb server: " + JSON.stringify(messageData));

  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: process.env.PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent message id %s to recipient %s",
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });
}

/**
  * Communicate with BotBot API
  */
function callBotAPI(endpoint, options = {}, token) {
  console.log("Sending message to master server: " + endpoint);
  const base_url = 'https://botbot.jakebrabec.me/api';
  options.uri = base_url + '/' + endpoint

  if (token) {
    options.headers = {
      'Authorization': 'Bearer ' + token
    };
  }

  return request(options);
}

function getPageAccessToken(token) {

  var headers = {
    'Authorization': 'Bearer ' + token
  };

  request({
    uri: 'https://botbot.jakebrabec.me/api/user/token',
    headers: headers,
    method: 'GET'
  }, function (error, response, body) {
    body = JSON.parse(body)
    if (body['facebook_token']) {
      pageAccessToken = body['facebook_token'];
      console.log('Page Access Token configured.');
    } else {
      console.log('Page Access Token configuration failed');
    }
  });

}

/**
  * Start server
  */
var server = app.listen(process.argv[2] || 4000, function () {
  console.log("BotBot listening on port %s", server.address().port);
  getPageAccessToken(process.argv[3]);
});
