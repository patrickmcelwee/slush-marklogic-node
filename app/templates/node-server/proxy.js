/*jshint node: true */

'use strict';

var router = require('express').Router();
var http = require('http');
var config = require('../gulp.config')();

var options = {
  mlHost: process.env.ML_HOST || config.marklogic.host,
  mlPort: process.env.ML_PORT || config.marklogic.port,
  defaultUser: config.marklogic.user,
  defaultPass: config.marklogic.password
};

// ==================================
// MarkLogic REST API endpoints
// ==================================
// For any other GET request, proxy it on to MarkLogic.
router.get('*', function(req, res) {
  proxy(req, res);

  // To require authentication before getting to see data, use this:
  // if (req.session.user === undefined) {
  //   res.send(401, 'Unauthorized');
  // } else {
  //   proxy(req, res);
  // }
  // -- end of requiring authentication
});

router.put('*', function(req, res) {
  // For PUT requests, require authentication
  if (req.session.user === undefined) {
    res.send(401, 'Unauthorized');
  } else if (req.path === '/v1/documents' &&
    req.query.uri.match('/users/') &&
    req.query.uri.match(new RegExp('/users/[^(' + req.session.user.name + ')]+.json'))) {
    // The user is try to PUT to a profile document other than his/her own. Not allowed.
    res.send(403, 'Forbidden');
  } else {
    if (req.path === '/v1/documents' && req.query.uri.match('/users/')) {
      // TODO: The user is updating the profile. Update the session info.
    }
    proxy(req, res);
  }
});

// Require authentication for POST requests
router.post('*', function(req, res) {
  if (req.session.user === undefined) {
    res.send(401, 'Unauthorized');
  } else {
    proxy(req, res);
  }
});

function getAuth(options, session) {
  var auth = null;
  if (session.user !== undefined && session.user.name !== undefined) {
    auth =  session.user.name + ':' + session.user.password;
  }
  else {
    auth = options.defaultUser + ':' + options.defaultPass;
  }

  return auth;
}

// Generic proxy function used by multiple HTTP verbs
function proxy(req, res) {
  var queryString = req.originalUrl.split('?')[1];
  var path = '/v1' + req.path + (queryString ? '?' + queryString : '');
  console.log(
    req.method + ' ' + req.path + ' proxied to ' +
    options.mlHost + ':' + options.mlPort + path);
  var mlReq = http.request({
    hostname: options.mlHost,
    port: options.mlPort,
    method: req.method,
    path: path,
    headers: req.headers,
    auth: getAuth(options, req.session)
  }, function(response) {

    res.statusCode = response.statusCode;

    // some requests (POST /v1/documents) return a location header. Make sure
    // that gets back to the client.
    if (response.headers.location) {
      res.header('location', response.headers.location);
    }

    response.on('data', function(chunk) {
      res.write(chunk);
    });
    response.on('end', function() {
      res.end();
    });
  });

  if (req.body !== undefined) {
    mlReq.write(JSON.stringify(req.body));
    mlReq.end();
  }

  mlReq.on('error', function(e) {
    console.log('Problem with request: ' + e.message);
  });
}

module.exports = router;
