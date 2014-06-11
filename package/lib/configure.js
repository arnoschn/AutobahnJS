

function Transports() {
    this._repository = {};
}

Transports.prototype.register = function() {
    var factory;
    var name;

    console.assert(arguments.length>0, "Need to provide at least 1 argument autobahn.transports.register(TransportFactory)");
    console.assert(arguments.length<3, "Need to provide at max 2 arguments autobahn.transports.register(alias, TransportFactory)");

    if(arguments.length==1) {
        factory = arguments[0];
        console.assert(typeof factory.name === "string", "Transport does not provide a .name attribute");
        name = factory.name;
    } else {
        name = arguments[0];
        factory = arguments[1];
        console.assert(typeof factory.name === "string", "Factory does not provide a .name attribute");
    }

    console.assert(typeof factory.prototype.create === "function", "Protocol '" + name + "' does not provide a .create method");
    this._repository[name] = factory;
};
Transports.prototype.isRegistered = function(name) {
    return this._repository[name] ? true: false;
};
Transports.prototype.get = function(name) {
    var mod;
    if (this._repository[name] !== undefined) {
        mod = this._repository[name];
    } else {

      console.assert(false, "No such transport: " + name);

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

function Protocols() {
    this._repository = {};
    this.encoders = new Encoders();
}

Protocols.prototype.register = function() {
    console.assert(arguments.length>0, "Need to provide at least 1 argument autobahn.protocols.register(Protocol)");
    console.assert(arguments.length<3, "Need to provide at max 2 arguments autobahn.protocols.register(alias, Protocol)");
    var protocol;
    var name;
    if(arguments.length==1) {
        protocol = arguments[0];
        console.assert(typeof protocol.name === "string", "Protocol does not provide a .name attribute");
        name = protocol.name;
    } else {
        name = arguments[0];
        protocol = arguments[1];
        console.assert(typeof protocol.name === "string", "Protocol does not provide a .name attribute");
    }

    console.assert(typeof protocol.protocol === "object", "Protocol '" + protocol.name + "' does not provide a .protocol export");
    this._repository[name] = protocol;
};
Protocols.prototype.isRegistered = function(name) {
    try {
        var prot = this.get(name);
        return true;
    } catch (Exc) {
        return false;
    }
};
Protocols.prototype.list = function() {
    var protocols = [];
    for (var protocol in this._repository) {
        if (this._repository[protocol].encoders) {
            for (var i = 0; i < this._repository[protocol].encoders.length; i++) {
                if (this.encoders.isRegistered(this._repository[protocol].encoders[i])) {
                    protocols.push(protocol + "." + this._repository[protocol].encoders[i]);
                }
            }
        } else {
            var encoders=this.encoders.list();
            for (var i=0;i<encoders.length;i++) {

                protocols.push(protocol + "." + encoders[i]);

            }
        }
    }
    return protocols;
};
Protocols.prototype.get = function(protocol) {
    var mod;
    var encoder;
    if (this._repository[protocol] !== undefined) {
        mod = this._repository[protocol];
    } else {
        // mixin
        var path = protocol.split(".");
        var encoding = path.pop();
        var _protocol = path.join(".");
        if (this._repository[_protocol] !== undefined) {
            mod = this._repository[_protocol];
            encoder = this.encoders.get(encoding);

            mod.protocol.encode = encoder.encode;
            mod.protocol.decode = encoder.decode;

        } else {
            console.assert(false, "No such protocol: " + protocol);
        }
    }
    return mod;
};

function Encoders() {
    this._repository = {};
}

Encoders.prototype.register = function() {
    console.assert(arguments.length>0, "Need to provide at least 1 argument autobahn.encoders.register(Encoder)");
    console.assert(arguments.length<3, "Need to provide at max 2 arguments autobahn.encoders.register(alias, Encoder)");
    var encoder;
    var name;
    if(arguments.length==1) {
        encoder = arguments[0];
        console.assert(typeof encoder.name === "string", "Encoder does not provide a .name attribute");
        name = encoder.name;
    } else {
        name = arguments[0];
        encoder = arguments[1];
        console.assert(typeof encoder.name === "string", "Encoder does not provide a .name attribute");
    }
    console.assert(typeof encoder.encode === "function", "Encoder '" + encoder.name + "' does not provide a .encode export");
    console.assert(typeof encoder.decode === "function", "Encoder '" + encoder.name + "' does not provide a .decode export");

    this._repository[name] = encoder;
};
Encoders.prototype.list = function() {
    var items = [];
    for(var name in this._repository) {
        items.push(name);
    }
    return items;
};
Encoders.prototype.get = function(name) {
    var mod;
    if (this._repository[name] !== undefined) {
        mod = this._repository[name];
    } else {

      console.assert(false, "No such encoder: " + name);

    }
    return mod;
};

Encoders.prototype.isRegistered = function(name) {
    return this._repository[name] ? true: false;
};


var _transports = new Transports();
var _protocols = new Protocols();



/**
 * Register defaults
 */
var encoder_json = require('./protocol/encoder/json.js');
_protocols.encoders.register("json", encoder_json);
var protocol_wampv2 = require('./protocol/wamp/2.js');
_protocols.register("wamp.2", protocol_wampv2);
var websocket = require('./websocket.js');
_transports.register("websocket", websocket.Factory);

exports.transports = _transports;
exports.protocols = _protocols;
exports.encoders = _protocols.encoders;