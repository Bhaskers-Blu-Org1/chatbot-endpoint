/* dependency setup */

var express = require("express");
var bodyParser = require('body-parser');
var sender = require('request');
var watson = require('watson-developer-cloud');

var assistantv2 = require('watson-developer-cloud/assistant/v2'); // watson sdk

var config = require('./config.json');

/* end of dependency setup */

var port = process.env.PORT || 8080;

var app = express();

app.post('/location', function(req, res) {

  console.log('setting geographic location');

  res.setHeader('Content-Type', 'application/json');

  latitude = parseFloat(req.body.latitude);
  longitude = parseFloat(req.body.longitude);

  res.send(JSON.stringify({
    outcome: "success"
  }, null, 3));

});

// Bootstrap application settings
app.use(express.static('./public')); // load UI from public folder
app.use(bodyParser.json());

// Create the service wrapper

var assistant = new assistantv2({
  version: config.version,
  iam_apikey: config.apikey,
  url: config.url
});

var sessionid;

assistant.createSession({
  assistant_id: config.id,
}, function(err, response) {
  if (err) {
    console.error(err);
  } else {

    sessionid = response.session_id;
    console.log('established watson assistant session')
    console.log('session id: ' + sessionid);
  }
});

var newContext = {
  global: {
    system: {
      turn_count: 1
    }
  }
};

function getWatsonPayload(req) {

  var contextWithAcc = (req.body.context) ? req.body.context : newContext;

  if (req.body.context) {
    contextWithAcc.global.system.turn_count += 1;
  }

  var textIn = '';

  if (req.body.input) {
    textIn = req.body.input;
  } else(
    console.log(req.body)
  )

  var payload = {
    assistant_id: config.id,
    session_id: sessionid,
    context: contextWithAcc,
    input: {
      message_type: 'text',
      text: textIn,
      options: {
        return_context: true
      }
    }
  };

  return payload;
}

// Endpoint to be call from the client side
app.post('/message', function(req, res) {

  res.setHeader('Content-Type', 'application/json');
  console.log("hit watson message endpoint");

  var payload = getWatsonPayload(req);

  console.log("sending message to watson assistant")
  // console.log(payload)

  // Send the input to the assistant service
  assistant.message(payload, function(err, data) {

    var assistantId = config.id;

    if (err) {

      console.log(err)

      return res.status(err.code || 500).json(err);
    }

    console.log("received response from watson assistant")

    // console.log(data)

    var keyword = '';

    if (data.output.entities != undefined) {

      var promise = new Promise(function(resolve, reject) {

        keyword = decideOnKeywords(data.output.entities);

        if (keyword != undefined) {
          console.log("watson assistant suggesed keywords");
          var elasticpromise = new Promise(function(elasticresolve, elasticreject) {
            var elasticdata = elasticresolve(callElasticSearch(keyword));
            if (elasticdata != undefined) {
              console.log("found elastic search content");
              console.log('keyword ' + keyword.value);
              return res.json(data);
            } else {
              elasticreject("failed to find elastic search content")
            }
          })
        } else {
          console.log("failed to find entities")
          reject(Error("It broke"));
        }
      });
    }
  });
});


function decideOnKeywords(entities) {

  console.log("entities found")
  // console.log(entities)

  var sortedentities = entities.sort(compare);

  console.log("sorted entities in order of confidence")
  // console.log(sortedentities)

  var reverseorder = sortedentities.reverse()

  if (reverseorder.length > 0) {
    var strongestcandidate = reverseorder[0];
  }

  console.log("proposing strongest candidate: " + strongestcandidate.value)

  return strongestcandidate;
}

function getElasticSearchOptions(keyword) {

  var path = 'http://169.55.81.195:31726/codey/v1/codepattern?search=' + keyword;
  // clinics = clinics + '?id_remedio=' + req.body.drug.id;

  var options = {
    url: path,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla'
    },
    json: null
  };

  return options;
}

function callElasticSearch(keyword) {

  console.log("calling elastic search")

  var elasticSearchResults;

  sender(getElasticSearchOptions(keyword), function(err, newresponse, clinics) {
    elasticSearchResults = newresponse.body;
    console.log(newresponse.body);
  })

  return elasticSearchResults;
}


function compare(a, b) {

  return parseFloat(a.confidence) - parseFloat(b.confidence)
  // if (a.confidence < b.confidence)
  //    return -1;
  // if (a.confidence > b.confidence)
  //   return 1;
  // return 0;
}

app.get('/content', function(req, res) {

  res.setHeader('Content-Type', 'application/json');

  /* First, send a message to Watson Assistant, to derive
     entities */

  var path = 'http://169.55.81.195:31726/codey/v1/codepattern?search=istio';
  // clinics = clinics + '?id_remedio=' + req.body.drug.id;

  var options = {
    url: path,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla'
    },
    json: null
  };

  var elasticSearchResults;

  sender(options, function(err, newresponse, clinics) {

    elasticSearchResults = newresponse.body;
    console.log(newresponse.body);
  })


  /* Secondly, send those entities on to Elastic Search, to
     ask for code patterns */

  res.send(JSON.stringify({
    outcome: elasticSearchResults
  }, null, 3));

});

app.listen(port);
console.log("Listening on port ", port);
