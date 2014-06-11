///////////////////////////////////////////////////////////////////////////////
//
//  AutobahnJS - http://autobahn.ws, http://wamp.ws
//
//  A JavaScript library for WAMP ("The Web Application Messaging Protocol").
//
//  Copyright (C) 2011-2014 Tavendo GmbH, http://tavendo.com
//
//  Licensed under the MIT License.
//  http://www.opensource.org/licenses/mit-license.php
//
///////////////////////////////////////////////////////////////////////////////

// Polyfills for < IE9
require("./polyfill.js");
require("./assert.js");

var pjson = require('../package.json');

var when = require('when');
//var fn = require("when/function");

if ('AUTOBAHN_DEBUG' in global && AUTOBAHN_DEBUG) {
   // https://github.com/cujojs/when/blob/master/docs/api.md#whenmonitor
   require('when/monitor/console');
   if ('console' in global) {
      console.log("AutobahnJS debug enabled");
   }
}

var util = require('./util.js');
var log = require('./log.js');
var session = require('./session.js');
var websocket = require('./websocket.js');
var connection = require('./connection.js');
var persona = require('./persona.js');
var longpoll = require('./longpoll.js');
var configure = require('./configure.js');

exports.version = pjson.version;

exports.WebSocket = websocket.WebSocket;

exports.protocols = configure.protocols;
exports.transports = configure.transports;
exports.encoders = configure.encoders;

exports.Connection = connection.Connection;
exports.LongPollSocket = longpoll.LongPollSocket;
exports.Session = session.Session;
exports.Invocation = session.Invocation;
exports.Event = session.Event;
exports.Result = session.Result;
exports.Error = session.Error;
exports.Subscription = session.Subscription;
exports.Registration = session.Registration;
exports.Publication = session.Publication;

exports.LOG_ERROR = log.Log.ERROR;
exports.LOG_INFO = log.Log.INFO;
exports.LOG_DEBUG = log.Log.DEBUG;
exports.LOG_WARN = log.Log.WARN;
exports.LOG_VERBOSE = log.Log.VERBOSE;
exports.LOG_IMPORTANT = log.Log.IMPORTANT;

exports.auth_persona = persona.auth;

exports.when = when;
exports.util = util;
exports.log = log;
