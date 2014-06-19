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
var util = require('./util.js');

function Transports() {
    this._repository = {};
}

Transports.prototype.register = function() {
    var factory;
    var name;
    var raiseError = typeof arguments[arguments.length-1] === "boolean" ? arguments[arguments.length-1]:true;

    try {

        util.assert(arguments.length>0, "Need to provide at least 1 argument autobahn.transports.register(TransportFactory)");
        util.assert(arguments.length<4, "Need to provide at max 3 arguments autobahn.transports.register(alias, TransportFactory, raiseError)");

        if(arguments.length==1) {
            factory = arguments[0];
            util.assert(typeof factory.type === "string", "Transport does not provide a .type attribute");
            name = factory.type;
        } else if(arguments.length == 2) {
            if(typeof arguments[1] === "boolean") {
                factory = arguments[0];
                util.assert(typeof factory.type === "string", "Transport does not provide a .type attribute");
                name = factory.type;
            } else {
                name = arguments[0];
                factory = arguments[1];
            }
            util.assert(typeof factory.type === "string", "Factory does not provide a .type attribute");
        } else {
            name = arguments[0];
            factory = arguments[1];
            raiseError = arguments[2];
        }
        util.assert(typeof factory.isSupported === "function", "Protocol '" + factory.type + "' does not provide a .isSupported static function");
        util.assert(typeof factory.prototype.create === "function", "Protocol '" + name + "' does not provide a .create method");
        util.assert(factory.isSupported(), "Factory '"+name+"' is not supported");

        this._repository[name] = factory;

    } catch(e) {
        if(raiseError) {
            throw e;
        } else {
            console.error(e);
        }

    }

};
Transports.prototype.isRegistered = function(name) {
    return this._repository[name] ? true: false;
};
Transports.prototype.get = function(name) {
    var mod;
    if (this._repository[name] !== undefined) {
        mod = this._repository[name];
    } else {

      util.assert(false, "No such transport: " + name);

    }
    return mod;
}
Transports.prototype.list = function() {
    var items = [];
    for(var name in this._repository) {
        items.push(name);
    }
    return items;
};

function Serializers() {
    this._repository = {};
}

Serializers.prototype.register = function() {
    var serializer;
    var name;
    var raiseError = typeof arguments[arguments.length-1] === "boolean" ? arguments[arguments.length-1]:true;

    try {


        util.assert(arguments.length>0, "Need to provide at least 1 argument autobahn.serializers.register(Serializer)");
        util.assert(arguments.length<4, "Need to provide at max 3 arguments autobahn.serializers.register(alias, Serializer, raiseError)");

        if(arguments.length==1) {
            serializer = arguments[0];
            util.assert(typeof serializer.type === "string", "Serializer does not provide a .type attribute");
            name = serializer.type;
        } else if(arguments.length == 2) {
            if(typeof arguments[1] === "boolean") {
                serializer = arguments[0];
                util.assert(typeof serializer.type === "string", "Serializer does not provide a .type attribute");
                name = serializer.type;
            } else {
                name = arguments[0];
                serializer = arguments[1];
                util.assert(typeof serializer.type === "string", "Serializer does not provide a .type attribute");
            }

        } else {
            name = arguments[0];
            serializer = arguments[1];
            util.assert(typeof serializer.type === "string", "Serializer does not provide a .type attribute");
        }
        util.assert(typeof serializer.mime_type === "string", "Serializer does not specify a .mime_type attribute");
        util.assert(typeof serializer.modes === "object" && serializer.modes.constructor === Array, "Serializer does not specify a .modes array");
        util.assert(typeof serializer.prototype === "object", "Serializer Class '" + serializer.type + "' does not provide a .prototype object");
        util.assert(typeof serializer.isSupported === "function", "Serializer '" + serializer.type + "' does not provide a .isSupported static function");
        util.assert(typeof serializer.prototype.serialize === "function", "Serializer '" + serializer.type + "' does not provide a .serialize method");
        util.assert(typeof serializer.prototype.unserialize === "function", "Serializer '" + serializer.type + "' does not provide a .unserialize method");
        util.assert(serializer.isSupported(), "Serializer '"+ name+"' is not supported");
        this._repository[name] = serializer;

     } catch(e) {
        if(raiseError) {
            throw e;
        } else {
            console.error(e);
        }
     }
};
Serializers.prototype.list = function() {
    var items = [];
    for(var name in this._repository) {
        items.push(name);
    }
    return items;
};
Serializers.prototype.get = function(name) {
    var mod;
    if (this._repository[name] !== undefined) {
        mod = this._repository[name];
    } else {

      util.assert(false, "No such serializer: " + name);

    }
    return mod;
};

Serializers.prototype.isRegistered = function(name) {
    return this._repository[name] ? true: false;
};




var _transports = new Transports();

var _serializers = new Serializers();


/**
 * Register defaults
 */

var websocket = require('./transport/websocket.js');
_transports.register("websocket", websocket.Factory, false);
var longpoll = require('./transport/longpoll.js');
_transports.register("longpoll", longpoll.Factory, false);
exports.transports = _transports;

    var serializer_json = require('./serializer/json.js');
_serializers.register("json", serializer_json.Serializer, false);


var serializer_msgpack = require('./serializer/msgpack.js');
_serializers.register("msgpack", serializer_msgpack.Serializer, false);

exports.serializers = _serializers;