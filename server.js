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
const appointmentTrigger = 'BBAppointment-';
// To keep track of <UUID>:<CATEGORY ID> for active users
var fbMap = {};
// To keep track of active support users
var supportUsers = {};

let pageAccessToken = '';

var appointmentStartTime = 0;
var appointmentEndTime = 0;
var appointmentMap = {};

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
  }).catch(function(error) {
      console.log("Error: " + error);
    });
}

/**
  * Inventory prompt
  */
function inventoryPrompt(sid, token) {

  callBotAPI('shop/getItems', {
    method: 'GET'
  }, token)
  .then((res) => JSON.parse(res))
    .then((json) => {
      let inventory = json.slice(0,10);
      let elementArr = [];

      for (var i in inventory) {
        var e = {
          title: inventory[i]["title"],
          image_url: inventory[i]["img"],
          subtitle: "$" + inventory[i]["price"],
          default_action: {
            type: "web_url",
            url: inventory[i]["url"]
          }
        }

        elementArr.push(e);
      }

      var messageData = {
        recipient: {
          id: sid
        },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "generic",
              elements: elementArr
            }
          }
        }
      };
      // Send message to user
      callSendAPI(messageData);

    });

}

/**
  * Support prompt
  */
function supportPrompt(sid, token) {

  getUserName(sid);

  // Message structure for FB
  var messageData = {
    recipient: {
      id: sid
    },
    message: {
      text: "What is your support regarding?"
    }
  };

  // Send message to user
  callSendAPI(messageData);
}

function getDateString(date) {
  let mm = (date.getMonth() + 1).toString();
  mm = mm.length < 2 ? '0' + mm : mm;

  let dd = (date.getDate() + 1).toString();
  dd = dd.length < 2 ? '0' + dd : dd;

  let yyyy = date.getFullYear().toString();

  return mm + '/' + dd + '/' + yyyy + ':';
}

function getFormatDateString(str) {
  var monthNames = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
  ];

  var day = str.substr(0, str.indexOf(':'));
  var time = str.substr(str.indexOf(':')+1, str.length - 1);

  var m = day.substring(0, day.indexOf("/"));
  day = day.substring(day.indexOf("/") + 1, day.length);
  var d = day.substring(0, day.indexOf("/"));
  day = day.substring(day.indexOf("/") + 1, day.length);
  var y = day;

  var t = parseInt(time.substr(0, time.indexOf(':')));
  var pm = false;
  pm = (t > 12) ? true : false;
  t = (t > 12) ? (t-12) : t;

  var dateString = monthNames[m-1] + ' ' + d + ' at ' + t + (pm ? 'pm' : 'am');
  
  return dateString;
}

function calculateAppointmentIntervals(token, sid) {
  var headers = {
    'Authorization': 'Bearer ' + token
  };

  request({
    uri: 'https://botbot.jakebrabec.me/api/appointment/hours',
    headers: headers,
    method: 'GET'
  }, function (error, response, body) {
    body = JSON.parse(body);
    appointmentStartTime = body['min_hour'];
    appointmentEndTime = body['max_hour'];
    let i = (appointmentEndTime - appointmentStartTime)/3;
    var d = getDateString(new Date());

    getAppointmentTimes(d, i, token, sid);
  });
}

function getAppointmentTimes(date, interval, token, sid) {
  checkAppointmentTime(0,date,Math.round(appointmentStartTime + (interval/2)),token,sid);
  checkAppointmentTime(1,date,Math.round(appointmentStartTime + ((appointmentEndTime-appointmentStartTime)/2)),token,sid);
  checkAppointmentTime(2,date,Math.round(appointmentEndTime - (interval/2)),token,sid);
}

function bookAppointment(date, sid, token) {
  var headers = {
    'Authorization': 'Bearer ' + token
  };

  request({
    uri: 'https://botbot.jakebrabec.me/api/appointment',
    headers: headers,
    method: 'POST',
    form: {timestamp: date}
  }, function (error, response, body) {
    body = JSON.parse(body);
    if (body['message'] == 'success') {
      var messageData = {
      recipient: {
        id: sid
      },
      message: {
        text: 'Your appointment is scheduled!'
      }
    };
    callSendAPI(messageData);
    }
    
  });
}

function checkAppointmentTime(p, d, t, token, sid) {
  let tt = t;
  let ttt;
  if ((p == 0) || (p == 1)) {
    ttt = t + 1;
  } else {
    ttt = t - 1;
  }
  
  tt = tt.length < 2 ? '0' + tt : tt;
  ttt = ttt.length < 2 ? '0' + ttt : ttt;

  let date = d + tt + ':00';
  let sDate = d + ttt + ':00';
  var taken = false;
  var sTaken = false;

  var headers = {
    'Authorization': 'Bearer ' + token
  };

  request({
    uri: 'https://botbot.jakebrabec.me/api/appointment',
    headers: headers,
    method: 'GET'
  }, function (error, response, body) {
    body = JSON.parse(body);
    if (body['message'] == 'success') {
      apps = body['appointments'];
      for (var i in apps) {
        var c = new Date(apps[i]['timestamp']);
        c.setDate(c.getDate() - 1);
        var compare = getDateString(c) + c.getHours() + ':00';
        if (compare == date) taken = true;
        if (compare == sDate) sTaken = true;
      }
      var arr = appointmentMap[sid];
      if (!arr) arr = [];

      if (!taken) {
        arr[p] = date;
        appointmentMap[sid] = arr;
      } else if (!sTaken) {
        arr[p] = sDate;
        appointmentMap[sid] = arr;
      } else {
        var newDate = new Date(d.substring(0, d.length -1));
        checkAppointmentTime(p, getDateString(newDate), t, token, sid);
      }

    }
  }); 
}

/**
  * Initiate reservation prompt
  */
function reservationPrompt(sid, token) {
  // Reservations needs user token
  if (!token) {
    console.log("Missing token for reservation prompt")
    return;
  }

  calculateAppointmentIntervals(token, sid);

  setTimeout(function(){ 
    if (appointmentMap[sid]) {
      var buttons = [];
      var a = appointmentMap[sid];
      for (var f in a) {
        var title = getFormatDateString(a[f]);
        buttons = buttons.concat({
          type: 'postback',
          title: title,
          payload: appointmentTrigger + a[f]
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
              text: "What appointment time works for you?",
              buttons: buttons
            }
          }
        }
      };
      // Send message to user
      callSendAPI(messageData);
    }    
  }, 2000);
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
    }).catch(function(error) {
        console.log("Error: " + error);
      });
}

function sendSupport(sid, support, token) {
  var name = supportUsers[sid];
  callBotAPI('tickets', {
    method: 'POST',
    form: {message: support, messenger_userid: sid, name: name}
  }, token)
  .then((res) => JSON.parse(res))
    .then((json) => {
      if (json.message === 'success') {
        var messageData = {
          recipient: {
            id: sid
          },
          message: {
            text: 'A support agent will be with you shortly!'
          }
        };
        callSendAPI(messageData);
      }
    }).catch(function(error) {
        console.log("Error: " + error);
      });
}

/**
  * Handle and direct messages
  */
function messageHandler(msg, token) {
  callBotAPI('bot', {
    method: 'GET'
  }, token)
  .then((res) => JSON.parse(res))
    .then((json) => {
      if (!msg.delivery) {
      console.log("Handling message: " + msg);
      if (fbMap[msg.sender.id]) {
        sendFeedback(msg.sender.id, fbMap[msg.sender.id], msg.message.text.toString());
        delete fbMap[msg.sender.id];
      }
      if (supportUsers[msg.sender.id]) {
        sendSupport(msg.sender.id, msg.message.text.toString(), token);
        delete supportUsers[msg.sender.id];
      }
      if ((msg.message.text == 'feedback') && json.bot['feedback_enabled']) {
        feedbackPrompt(msg.sender.id, token);
      }
      if ((msg.message.text == 'reservation') && json.bot['reservations_enabled']) {
        reservationPrompt(msg.sender.id, token);
      }
      if ((msg.message.text == 'inventory') && json.bot['shopify_enabled']) {
        inventoryPrompt(msg.sender.id, token);
      }
      if ((msg.message.text == 'support') && json.bot['customer_support_enabled']) {
        supportPrompt(msg.sender.id, token);
      }
    } else {
      console.log("Missing msg.delivery field");
    }

    });
  
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

  if (type.startsWith(appointmentTrigger)) {
    console.log("Setting appointment");
    bookAppointment(type.replace(appointmentTrigger, ''), postback.sender.id, process.argv[3]);
    
  }



}

/**
  * Send messages using Bot
  */
function callSendAPI(messageData) {
  console.log("Sending message to fb server: " + JSON.stringify(messageData));

  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: pageAccessToken },
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
  })
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

function getUserName(sid) {
  request({
    uri: 'https://graph.facebook.com/v2.6/' + sid + '?fields=first_name,last_name&access_token=' + pageAccessToken,
    method: 'GET'
  }, function (error, response, body) {
    body = JSON.parse(body);
    supportUsers[sid] = body.first_name + ' ' + body.last_name;
  });
}

app.get('/', (req, res) => {
  
  /** UPDATE YOUR VERIFY TOKEN **/
  const VERIFY_TOKEN = "i-slay-hey-i-slay-hey";
  
  // Parse params from the webhook verification request
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
    
  // Check if a token and mode were sent
  if (mode && token) {
  
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      
      // Respond with 200 OK and challenge token from the request
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);      
    }
  }
});

/**
  * Start server
  */
var server = app.listen(process.argv[2] || 4000, function () {
  console.log("BotBot listening on port %s", server.address().port);
  console.log("Arg Array: " + JSON.stringify(process.argv));
  getPageAccessToken(process.argv[3]);
});
