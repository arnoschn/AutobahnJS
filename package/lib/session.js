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

// require('assert') would be nice .. but it does not
// work with Google Closure after Browserify




var util = require('./util.js');



var Invocation = function (caller, progress) {



    this.caller = caller;
    this.progress = progress;
};


var Event = function (publication, publisher) {



    this.publication = publication;
    this.publisher = publisher;
};


var Result = function (args, kwargs) {

    this.args = args || [];
    this.kwargs = kwargs || {};
};


var Error = function (error, args, kwargs) {

    this.error = error;
    this.args = args || [];
    this.kwargs = kwargs || {};
};


var Subscription = function (topic, handler, options, session, id) {

    this.topic = topic;
    this.handler = handler;
    this.options = options || {};
    this.session = session;
    this.id = id;

    this.active = true;
};


Subscription.prototype.unsubscribe = function () {


    return this.session.unsubscribe(self);
};


var Registration = function (procedure, endpoint, options, session, id) {

    this.procedure = procedure;
    this.endpoint = endpoint;
    this.options = options || {};
    this.session = session;
    this.id = id;

    this.active = true;
};


Registration.prototype.unregister = function () {


    return this.session.unregister(self);
};


var Publication = function (id) {

    this.id = id;
};


var Session = function (protocol_loader, socket, defer, options) {



    // the transport connection (WebSocket object)
    this._load_protocol = protocol_loader;
    this._prefixes = {};
    this._socket = socket;
    this.options = options;
    this.events = {};
    if (this.options.events) {
        for (var event in this.options.events) {
            if(typeof this.options.events[event] === "function") {
                this.events[event] = this.options.events[event].bind(this);
            }
        }
    }

    var _protocol = socket.protocol.replace("_", "_").replace(",", "");
    this._protocol = {"session": this};
    this.protocol = _protocol || socket.protocol || socket.protocol + "";
    var prot_mixin = new util.Mixin("protocol", this._load_protocol(this.protocol, this.options));
    prot_mixin.apply(this._protocol, this._protocol);
    console.assert(typeof this._protocol.encode === "function", "Protocol '" + this.protocol + "' does not provide an encode method");
    console.assert(typeof this._protocol.decode === "function", "Protocol '" + this.protocol + "' does not provide a decode method");
    // the Deferred factory to use
    this.defer = defer;

    this._reset();
    this._protocol.__init__();

    // session object constructed .. track creation time
    //
    if ('performance' in global && 'now' in performance) {
        this._created = performance.now();
    } else {
        this._created = Date.now();
    }


};
Session.prototype._destruct = function() {
    this._reset();
    this._created = null;
    this._defer = null;
    this.defer = null;
    this.protocol = null;
    this._protocol = {};
    this._socket = null;
    this.events = null;
    this.options = null;
    this._load_protocol = null;
    this._prefixes = null;
};
Session.prototype._reset = function () {
    this.isOpen = false;
    this.id = null;
    this.realm = null;
    this.features = null;
    this.subscriptions = this.registrations = {};

};
Session.prototype._send = function (msg) {
    this._socket.send(this._protocol.encode({"data": msg}));
};
Session.prototype.onmessage = function (msg) {
    this._protocol.onmessage(this._protocol.decode(msg));
};

Object.defineProperty(Session.prototype, "_hasProperties", {
    get: function () {
        return true;
    }
});


Session.prototype._setId = function (id) {

    this.id = id;
    this.isOpen = this.id !== null;

};


Session.prototype._setRealm = function (realm) {

    this.realm = realm;

};


Session.prototype._setFeatures = function (features) {

    this.features = features;

};

Session._getSubscriptions = function (subscriptions) {

    var keys = Object.keys(subscriptions);
    var vals = [];
    for (var i = 0; i < keys.length; ++i) {
        vals.push(subscriptions[keys[i]]);
    }

    return vals;
};


Session.prototype._setSubscriptions = function (subscriptions) {

    var keys = Object.keys(subscriptions);
    var vals = [];
    for (var i = 0; i < keys.length; ++i) {
        vals.push(subscriptions[keys[i]]);
    }
    this.subscriptions = Session._getSubscriptions(subscriptions);

};


Session._getRegistrations = function (registrations) {

    var keys = Object.keys(registrations);
    var vals = [];
    for (var i = 0; i < keys.length; ++i) {
        vals.push(registrations[keys[i]]);
    }

    return vals;
};

Session.prototype._setRegistrations = function (registrations) {


    this.registrations = Session._getRegistrations(registrations);

};


Session.prototype.join = function (realm, authmethods) {

    console.assert(typeof realm === 'string', "Session.join: <realm> must be a string");
    console.assert(!authmethods || authmethods instanceof Array, "Session.join: <authmethods> must be an array []");


    this._assertNotOpen();


    var msg = this._protocol.join(realm, authmethods);
    this._send(msg);
};


Session.prototype.leave = function (reason, message) {

    console.assert(!reason || typeof reason === 'string', "Session.leave: <reason> must be a string");
    console.assert(!message || typeof message === 'string', "Session.leave: <message> must be a string");

    this._assertOpen();

    var msg = this._protocol.leave(reason, message);
    this._send(msg);
    this._reset(); // ???

};


Session.prototype.call = function (procedure, args, kwargs, options) {

    console.assert(typeof procedure === 'string', "Session.call: <procedure> must be a string");
    console.assert(!args || args instanceof Array, "Session.call: <args> must be an array []");
    console.assert(!kwargs || kwargs instanceof Object, "Session.call: <kwargs> must be an object {}");
    console.assert(!options || options instanceof Object, "Session.call: <options> must be an object {}");

    this._assertOpen();
    var defer_and_msg = this._protocol.call(this.resolve(procedure), args, kwargs, options);
    console.assert(defer_and_msg instanceof Array, "Protocol.call: must return an array [defer, msg]");
    console.assert(defer_and_msg.length == 2, "Protocol.call: must return an array [defer, msg]");
    this._send(defer_and_msg[1]);
    return defer_and_msg[0];

};


Session.prototype.publish = function (topic, args, kwargs, options) {

    console.assert(typeof topic === 'string', "Session.publish: <topic> must be a string");
    console.assert(!args || args instanceof Array, "Session.publish: <args> must be an array []");
    console.assert(!kwargs || kwargs instanceof Object, "Session.publish: <kwargs> must be an object {}");
    console.assert(!options || options instanceof Object, "Session.publish: <options> must be an object {}");


    this._assertOpen();

    var defer_and_msg = this._protocol.publish(this.resolve(topic), args, kwargs, options);
    console.assert(defer_and_msg instanceof Array, "Protocol.publish: must return an array [defer, msg]");
    console.assert(defer_and_msg.length == 2, "Protocol.publish: must return an array [defer, msg]");
    this._send(defer_and_msg[1]);
    if (defer_and_msg[0] !== null) {
        return defer_and_msg[0];
    }


};


Session.prototype.subscribe = function (topic, handler, options) {

    console.assert(typeof topic === 'string', "Session.subscribe: <topic> must be a string");
    console.assert(typeof handler === 'function', "Session.subscribe: <handler> must be a function");
    console.assert(!options || options instanceof Object, "Session.subscribe: <options> must be an object {}");

    this._assertOpen();

    var defer_and_msg = this._protocol.subscribe(this.resolve(topic), topic, handler, options);
    console.assert(defer_and_msg instanceof Array, "Protocol.subscribe: must return an array [defer, msg]");
    console.assert(defer_and_msg.length == 2, "Protocol.subscribe: must return an array [defer, msg]");
    this._send(defer_and_msg[1]);
    return defer_and_msg[0];


};


Session.prototype.register = function (procedure, endpoint, options) {

    console.assert(typeof procedure === 'string', "Session.register: <procedure> must be a string");
    console.assert(typeof endpoint === 'function', "Session.register: <endpoint> must be a function");
    console.assert(!options || options instanceof Object, "Session.register: <options> must be an object {}");
    this._assertOpen();

    var defer_and_msg = this._protocol.register(this.resolve(procedure), procedure, endpoint, options);
    console.assert(defer_and_msg instanceof Array, "Protocol.register: must return an array [defer, msg]");
    console.assert(defer_and_msg.length == 2, "Protocol.register: must return an array [defer, msg]");
    this._send(defer_and_msg[1]);
    return defer_and_msg[0];

};

Session.prototype._assertOpen = function () {
    console.assert(this.isOpen, "Session must be open");
};
Session.prototype._assertNotOpen = function () {
    console.assert(!this.isOpen, "Session must be closed");
};
Session.prototype.unsubscribe = function (subscription) {

    console.assert(subscription instanceof Subscription, "Session.unsubscribe: <subscription> must be an instance of class autobahn.Subscription");
    this._assertOpen();

    var defer_and_msg = this._protocol.unsubscribe(subscription);
    console.assert(defer_and_msg instanceof Array, "Protocol.unsubscribe: must return an array [defer, msg]");
    console.assert(defer_and_msg.length == 2, "Protocol.unsubscribe: must return an array [defer, msg]");
    if (defer_and_msg[1] !== null) {
        this._send(defer_and_msg[1]);
    }

    return defer_and_msg[0];
};


Session.prototype.unregister = function (registration) {

    console.assert(registration instanceof Registration, "Session.unregister: <registration> must be an instance of class autobahn.Registration");

    this._assertOpen();
    var defer_and_msg = this._protocol.unregister(registration);
    console.assert(defer_and_msg instanceof Array, "Protocol.unregister: must return an array [defer, msg]");
    console.assert(defer_and_msg.length == 2, "Protocol.unregister: must return an array [defer, msg]");
    this._send(defer_and_msg[1]);


    return defer_and_msg[0];


};


Session.prototype.prefix = function (prefix, uri) {

    console.assert(typeof prefix === 'string', "Session.prefix: <prefix> must be a string");
    console.assert(!uri || typeof uri === 'string', "Session.prefix: <uri> must be a string or falsy");


    if (uri) {
        this._prefixes[prefix] = uri;
    } else {
        if (prefix in this._prefixes) {
            this._prefixes[prefix] = null;
            delete this._prefixes[prefix];
        }
    }
};


Session.prototype.resolve = function (curie) {

    console.assert(typeof curie === 'string', "Session.resolve: <curie> must be a string");


    // skip if not a CURIE
    var i = curie.indexOf(":");
    if (i >= 0) {
        var prefix = curie.substring(0, i);
        if (prefix in this._prefixes) {
            return this._prefixes[prefix] + '.' + curie.substring(i + 1);
        } else {
            throw "cannot resolve CURIE prefix '" + prefix + "'";
        }
    } else {
        return curie;
    }
};


exports.Session = Session;

exports.Invocation = Invocation;
exports.Event = Event;
exports.Result = Result;
exports.Error = Error;
exports.Subscription = Subscription;
exports.Registration = Registration;
exports.Publication = Publication;
