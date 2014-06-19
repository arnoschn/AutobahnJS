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

var when = require('when');
var session = require('./session.js');
var util = require('./util.js');
var log = require('./log.js');
var autobahn = require('./autobahn.js');


var _SessionMixin = new util.Mixin("session", {
    "onjoin": function (details) {

        this._setIsOpen(true);
        this._setReadyState(Connection.OPEN, details);
    },
    "onleave": function (reason, details) {
        this._setIsOpen(false);
        this._setReadyState(Connection.CLOSING);

        this.session._setId(null);
        this.session.logger.remove();
        this._transport.close(1000);
    },
    "log": function () {
        if(typeof this.session.logger !== "undefined") {
            this.session.logger.log.apply(this.session.logger, arguments);
        } else {
            this.logger.log.apply(this.logger, arguments);
        }

    },
    "debug": function () {
        if(typeof this.session.logger !== "undefined") {
            this.session.logger.debug.apply(this.session.logger, arguments);
        } else {
            this.logger.debug.apply(this.logger, arguments);
        }

    },
    "error": function () {
        if(typeof this.session.logger !== "undefined") {
            this.session.logger.error.apply(this.session.logger, arguments);
        } else {
            this.logger.error.apply(this.logger, arguments);
        }

    },
    "info": function () {
        if(typeof this.session.logger !== "undefined") {
            this.session.logger.info.apply(this.session.logger, arguments);
        } else {
            this.logger.info.apply(this.logger, arguments);
        }

    },
    "warn": function () {
        if(typeof this.session.logger !== "undefined") {
            this.session.logger.warn.apply(this.session.logger, arguments);
        } else {
            this.logger.warn.apply(this.logger, arguments);
        }

    }
});

var _TransportMixin = new util.Mixin("transport", {
    "onmessage": function (msg) {

        this.session.onmessage(msg);
    },
    "onopen": function (protocol) {
        var evt={"protocol":typeof protocol==="object"?this._transport.protocol:protocol};
        this._setReadyState(Connection.CONNECTING, evt);
    },
    "log": function (msg) {
        this.logger.log(msg);
    },
    "ontimeout": function (evt) {

        this._setReadyState(Connection.CLOSED, evt);
    },
    "onerror": function (evt) {

        this._setReadyState(Connection.ERROR, evt);

    },
    "onclose": function (evt) {


        this._setReadyState(Connection.CLOSED, evt);

    }
});


var RetryStrategy = function (_options) {
    this.user_defined_options = _options;
    this.options = util.merge_options(RetryStrategy.default_options, this.user_defined_options);
    this._rest_retry_time = null;
    this.delay = null;
};

RetryStrategy.default_options = {
    initial_delay: 1.5,
    max_delay: 300,
    max_time: false,
    max_retries: 15,
    resend_buffer: true,
    delay_jitter: 0.1,
    delay_growth: 1.5
};

RetryStrategy.prototype.determine = function (obj) {
    var result = {retry: false, delay: null, msg: null};
    if (this.options.max_time !== false) {

        this._rest_retry_time = this.options.max_time - obj.retry_time;

    }


    if (obj.retry_count < this.options.max_retries) {
        result.retry = true;
        if (!this.delay) {
            this.delay = this.options.initial_delay || 1;
        } else {



            // jitter retry delay
            if (this.options.delay_jitter) {
                this.delay = util.rand_normal(this.delay, this.delay * this.options.delay_jitter);
            }

            // cap the retry delay
            if (this.delay > this.options.max_delay) {
                this.delay = this.options.max_delay;
            }
            if (this.options.max_time !== false) {
                if (this._rest_retry_time < 1) {
                    result.retry = false;
                    result.msg = "Max retry time exceeded";
                    return result;
                } else if (this.delay > this._rest_retry_time) {
                    this.delay = this._rest_retry_time;
                }
            }


            // retry delay growth for next retry cycle

            if (this.options.delay_growth) {
                this.delay = this.delay * this.options.delay_growth;
            }
        }
        result.delay = this.delay;
    } else {
        result.msg = "Max retry attempts exceeded";
    }
    return result;

};

RetryStrategy.prototype.reset = function () {
    this.delay = null;
    this._rest_retry_time = null;
};

var Connection = function (options) {
    this._id =  Math.floor(Math.random() * 9007199254740992);
    this.user_defined_options = options;
    this._default_serializer = "json";
    this._switching_transport = null;
    this._init_options();
    this._init_events();
    this._readyState = Connection.INIT;
};
Connection.INIT = -1;
Connection.CONNECTING = 0;
Connection.OPEN = 1;
Connection.CLOSING = 2;
Connection.CLOSED = 3;
Connection.ERROR = 5;
Connection.RETRYING = 6;
Connection.UNREACHABLE = 7;
Connection.DEAD = 8;
Connection.SWITCH_TRANSPORT = 9;
Connection.ABORTED = 10;

Connection.STATES = {
    "-1": "INIT",
    "0": "CONNECTING",
    "1": "OPEN",
    "2": "CLOSING",
    "3": "CLOSED",
    "5": "ERROR",
    "6": "RETRYING",
    "7": "UNREACHABLE",
    "8": "DEAD",
    "9": "SWITCH_TRANSPORT",
    "10": "ABORTED"
};

Connection.default_options = {
    // retry options
    retry: {
        strategy: RetryStrategy,
        options: RetryStrategy.default_options
    },
    // defer config
    use_es6_promises: false,
    use_deferred: when.defer,

    // protocol config, adds the protocols via Connection.registerProtocol
    protocols: null,


    // force protocol
    use_protocol: null,

    // logging
    log_level: log.ERROR,

    // overwriting transport class, by default: Websocket or longpoll.LongPollSocket (longpoll.transport)
    transports: [
        {type: "websocket"},
        {type: "longpoll"}
    ],
    // session options
    session: {
        log_level: log.ERROR,
        events: {
            onjoin: null,
            onleave: null,
            onchallenge: null
        }

    },
    url: null,
    realm: null,
    authmethods: [],

    // compat config:
    max_retries: false,
    initial_retry_delay: false,
    max_retry_delay: false,
    retry_delay_growth: false,
    retry_delay_jitter: false

};


Connection.prototype._init = function () {

    this._init_logging();
    this._init_defer();
    this._init_protocols();
    this._init_retry_strategy();
    this._init_transport_factories();
    this._reset();

};
Connection.prototype._init_events = function () {
    this.onopen = null;
    this.onclose = null;
    this.onlost = null;
    this.ondead = null;
    this.onretry = null;
    this.onunreachable = null;
};
Connection.prototype._init_retry_strategy = function () {

    util.assert(typeof this.options.retry.strategy.prototype === "object", "Retry strategy needs to be a class");
    util.assert(typeof this.options.retry.strategy.prototype.determine === "function", "Retry strategy needs a determine method");
    util.assert(typeof this.options.retry.strategy.prototype.reset === "function", "Retry strategy needs a reset method");
    this._retry_strategy = new this.options.retry.strategy(this.options.retry.options);

};
Connection._deprecated_retry_options = {"max_retries": "max_retries", "initial_retry_delay": "initial_delay",
    "max_retry_delay": "max_delay", "retry_delay_growth": "delay_growth",
    "retry_delay_jitter": "delay_jitter"};

Connection.prototype._migrate_deprecated_retry_options = function () {
    var old_option;
    var new_option;
    for (old_option in Connection._deprecated_retry_options) {
        if (this.options[old_option] !== false) {
            new_option = Connection._deprecated_retry_options[old_option];
            this.options.retry[new_option] = this.options[old_option];
            this.logger.warn("Deprecated option '" + old_option + "' used, should use 'retry." + new_option + "' instead");
            this.options[old_option] = null;
            delete this.options[old_option];
        }
    }
};
Connection._mandatory_options = {
    url: true,
    realm: true
};
Connection.prototype._validate_mandatory_options = function () {
    var missing_options = [];
    var opt;
    for (opt in Connection._mandatory_options) {
        if (Connection._mandatory_options[opt] && !this.options[opt]) {
            missing_options.push(opt);

        }
    }
    if (missing_options.length > 0) {
        util.assert(false, "Missing mandatory options '" + missing_options.join("','") + "'");
    }
};
Connection.prototype._init_options = function () {
    this.options = util.merge_options(Connection.default_options, this.user_defined_options);
    this._validate_mandatory_options();
    this._migrate_deprecated_retry_options();
    if (this.options.retry && this.options.retry.max_retries && this.options.retry.max_delay === false && this.options.retry.max_time !== false) {

        this.options.retry.max_delay = (this.options.retry.max_time / this.options.retry.max_retries) / 1.5;

    }

};
Connection.prototype._es6_promise = function (deferred, resolve, reject) {
    deferred.resolve = resolve;
    deferred.reject = reject;
};
Connection.prototype._es6_defer = function () {
    var deferred = {};

    deferred.promise = new Promise(this._es6_promise.bind(this, deferred));

    return deferred;
};
Connection.prototype._init_defer = function () {
    // Deferred factory
    //
    if (this.options.use_es6_promises) {

        if ('Promise' in global) {
            // ES6-based deferred factory
            //
            this._defer = this._es6_defer.bind(this);
        } else {

            this.logger.debug("Warning: ES6 promises requested, but not found! Falling back to whenjs.");

            // whenjs-based deferred factory
            //
            this._defer = this.options.use_deferred;
        }

    } else {

        // whenjs-based deferred factory
        //
        this._defer = this.options.use_deferred;
    }

    if (!this._hasProperties) {
        this.defer = this._defer;
    }
};


Connection.prototype._init_logging = function () {
    var now = new Date();

    this._started_at = now.getTime();
    this.logger = new log.Log("Connection[id="+this._id+" - " + this.options.url + " @ " + now.toUTCString() + "]", this.options.log_level);
    this.logger.formatter = new log.TimeDeltaFormatter(this._started_at);
    this.logger.debug("Created connection object with options:", this.options);
};
Connection.prototype._init_protocols = function () {
    this.options.protocols = this._filter_protocols(this.options.protocols);
};
Connection.prototype._filter_transports = function (transports) {
    var i;
    var acceptable_transports = [];
    if (transports) {
        for (i = 0; i < transports.length; i++) {

            try {



                if(autobahn.transports.isRegistered(transports[i]["type"])) {
                    acceptable_transports.push(transports[i]);
                } else {
                    this.logger.error("Transport '" + transports[i]["type"] + "' is not supported");
                }

            } catch (e) {
                this.logger.error("Protocol '" + protocols[i] + "' cannot be used: ", e);
            }

        }

    } else {
        var transports = autobahn.transports.list();

        for (var i = 0; i < transports.length; i++) {
            acceptable_transports.push({type:transports[i]});

        }
    }

    return acceptable_transports;

};
Connection.prototype._filter_protocols = function (protocols) {
    var i;
    var acceptable_protocols = [];
    if (protocols) {
        for (i = 0; i < protocols.length; i++) {
            var parts = protocols[i].split(".");
            util.assert(parts.length > 1 && parts.length < 5, "Protocol definition must be of format: wamp.2.json[.batched]");
            var prot = parts[0];
            var version = parts[1];
            var serializer_id = parts[2] || this._default_serializer;
            try {


                util.assert(prot == "wamp", "Unknown protocol '" + prot + "'");
                util.assert(version == "2", "Unknown protocol version '" + version + "'");
                util.assert(autobahn.serializers.isRegistered(serializer_id), "Unknown serializer '" + serializer_id + "'");

                if (parts.length == 4) {
                    var serializer = autobahn.serializers.get(serializer_id);
                    util.assert(serializer.modes.indexOf(parts[3]) > -1, "Unknown mode: " + parts[3]);
                }
                acceptable_protocols.push(protocols[i]);
            } catch (e) {
                this.logger.error("Protocol '" + protocols[i] + "' cannot be used: ", e);
            }

        }

    } else {
        var serializers = autobahn.serializers.list();
        var serializer;
        var protocol = "wamp.2";
        for (var i = 0; i < serializers.length; i++) {
            serializer = autobahn.serializers.get(serializers[i]);
            var base_prot = protocol + "." + serializer.type;

            for (var m = 0; m < serializer.modes.length; m++) {
                acceptable_protocols.push(base_prot + "." + serializer.modes[m]);
            }
            acceptable_protocols.push(base_prot);
        }
    }

    return acceptable_protocols;

};


Connection.prototype._init_transport_factories = function () {
    // WAMP transport
    //
    var transports, transport_options, transport_factory, transport_factory_klass;
    this._transport_factories = [];
    this._transport_idx = null;
    this._transports_unreachable = [];
    this._transport = null;
    util.assert(this.options.transports, "No transport.factory specified");
    transports = this.options.transports;
    if (typeof transports === "object" && transports.constructor !== Array) {
        this.options.transports = [transports];
    }
    this.options.transports = this._filter_transports(this.options.transports);

    for (var i = 0; i < this.options.transports.length; i++) {
        // cascading transports until we find one which works
        transport_options = this.options.transports[i];
        if (!transport_options.url) {
            // defaulting to options.url if none is provided
            transport_options.url = this.options.url;
        }
        transport_options.defer = this._defer;
        if (!transport_options.protocols) {
            transport_options.protocols = this.options.protocols;
        } else {
            transport_options.protocols = this._filter_protocols(transport_options.protocols);
            if (transport_options.protocols.length < 1) {
                this.logger.warn("No protocols available on transport, using default protocols");
                transport_options.protocols = this.options.protocols;
            }
        }
        util.assert(transport_options.type, "No transport.type specified");
        util.assert(typeof transport_options.type === "string", "transport.type must be a string");
        try {
            transport_factory_klass = autobahn.transports.get(transport_options.type);
            if (transport_factory_klass) {
                transport_factory = new transport_factory_klass(transport_options);
                transport_factory.type = transport_factory_klass.type;
                this._transport_factories.push(transport_factory);
            }
        } catch (exc) {
            this.logger.error(exc);
        }
    }
};


Connection.prototype._destroy_transport = function () {
    if (this._transport) {
        if (typeof this._transport._destruct === "function") {

            this._transport._destruct();

        }
        this._transport = null;
    }
};
Connection.prototype._create_transport = function () {
    // WAMP transport
    //
    this._destroy_transport();
    var transport;
    for (var i = 0; i < this._transport_factories.length; i++) {
        try {
            if (this._transports_unreachable.indexOf(i) < 0) {
                transport = this._transport_factories[i].create();
                if (transport) {

                    transport.binaryType = "arraybuffer";
                    if (this._switching_transport === null) {
                        this._switching_transport = false;
                        this.logger.info("Using transport:" + this._transport_factories[i].type);
                    }
                    else if (this._switching_transport === true) {
                        this.logger.info("Switching transport to:" + this._transport_factories[i].type);
                        this._switching_transport = false;
                    }

                    this._transport_idx = i;
                    if (!transport.name) {
                        transport.name = this._transport_factories[i].type;
                    }
                    transport.BINARY = false;
                    _TransportMixin.apply(this, transport);


                    break;
                }
            }
        } catch (exc) {
            this.logger.error(exc);
        }
    }
    util.assert(transport, "Could not find a suitable transport");
    return transport;
};


Connection.prototype._reset = function () {

    this._onopen_called = false;
    this._onerror_called = false;
    // total number of successful connections
    this._connect_successes = 0;
    this._connect_failures = 0;

    this._check_transport_timeout = null;

    this._setIsConnected(false);
    this._setIsOpen(false);
    this._reset_retries();
    this._reset_session();
    this._setReadyState(Connection.INIT);
};

Connection.prototype._reset_retries = function () {
    // controls if we should try to reconnect
    this._retry = true;
    this._retry_count = 0;
    this._retry_started_timestamp = null;
    if (this._retry_timeout) {
        clearTimeout(this._retry_timeout);
    }
    this._retry_timeout = null;
    this._setIsRetrying(false);
    this._retry_strategy.reset();
};
Connection.prototype._reset_session = function () {

    if (this.session) {
        this.session._destruct();
    }

    this.session = null;

};


Connection.prototype._automatic_reconnect = function (send_buffer, was_open, error) {
    var now;
    var current_timestamp;
    var retry_time;
    var retry_object;
    var retry_decision;

    this._connect_failures += 1;
    if (was_open) {

        this.logger.error("Lost connection");
        this.logger.close();
        now = new Date();
        this.logger._destruct();
        this.logger = null;
        this.logger = new log.Log("Connection[" + this.options.url + " @ " + now.toUTCString() + "]", this.options.log_level);
        this.logger.formatter = new log.TimeDeltaFormatter(now.getTime());
    }
    this._setIsOpen(false);
    current_timestamp = new Date().getTime();
    if (this._retry_started_timestamp === null) {
        this._retry_started_timestamp = current_timestamp;
    }
    retry_time = (current_timestamp - this._retry_started_timestamp) / 1000.0;
    retry_object = {
        was_open: was_open,
        retry_count: this._retry_count,
        retry_time: retry_time,
        successful_connections: this._connect_successes,
        failed_connections: this._connect_failures,
        protocol: this.protocol,
        last_error: error

    };
    retry_decision = this._retry_strategy.determine(retry_object);
    retry_decision.retry_count = retry_object.retry_count;
    retry_decision.retry_time = retry_object.retry_time;
    retry_decision.successful_connections = retry_object.successful_connections;
    retry_decision.failed_connections = retry_object.failed_connections;
    retry_decision.protocol = retry_object.protocol;
    retry_decision.last_error = retry_object.last_error;
    this._setIsRetrying(retry_decision.retry);
    if (retry_decision.retry === true) {
        if (this._retry_timeout) {
            clearTimeout(this._retry_timeout);
        }


        this._retry_timeout = setTimeout(this._retry_connect.bind(this, send_buffer, retry_decision.delay, false, retry_decision), retry_decision.delay * 1000);
        this._retry_count += 1;
    }

    return retry_decision;

};

Connection.prototype._load_protocol = function (protocol) {
    var prot, version;

    var parts = protocol.split(".");
    util.assert(parts.length > 1 && parts.length < 5, "Protocol needs to be of format: wamp.2.json[.batched]");
    prot = parts[0];
    util.assert(prot === "wamp", "Unknown protocol: '" + prot + "'. Only wamp protocol is currently supported");
    version = parts[1];
    util.assert(version === "2", "Only wamp version 2 is currently supported");


    var mod = require("./protocol/wamp/2.js");

    return mod.protocol;

};
Connection.prototype._load_serializer = function (protocol) {
    var serializer_id, serializer_options;

    var parts = protocol.split(".");
    util.assert(parts.length > 2 && parts.length < 5, "Protocol needs to be of format: wamp.2.json[.batched]");
    serializer_id = parts[2] || this._default_serializer;
    util.assert(autobahn.serializers.isRegistered(serializer_id), "Unknown serializer '" + serializer_id + "'");
    serializer_options = {};
    if (parts.length == 4) {
        serializer_options[parts[3]] = true;
    }

    var klass = autobahn.serializers.get(serializer_id);

    var serializer = new klass(serializer_options);
    serializer.mime_type = klass.mime_type;
    serializer.BINARY = klass.BINARY;
    serializer.type = klass.type;

    return serializer;

};


Connection.prototype.clearSendBuffer = function () {
    if (this._transport && this._transport._send_buffer) {
        this._transport._send_buffer = [];
    }
};


Connection.prototype.log = function () {
    if (this.session) {
        this.session.log.apply(this.session, arguments);
    } else if (this.logger) {
        this.logger.log.apply(this.logger, arguments);
    } else {
        console.log.apply(this, arguments);
    }
};


Connection.prototype._retry_connect = function (send_buffer, timeout, initial_connect, evt) {

    try {
        initial_connect = initial_connect || false;
        if (!initial_connect) {
            this._setReadyState(Connection.RETRYING, evt);
        }

        if (this._transport && this._transport.logger) {

            this._transport.logger.close();
            this._transport.logger._destruct();
            this._transport.logger = null;
            this._transport.onopen = null;
            this._transport = this._create_transport();

            this._transport.timeout = timeout;
            if (this._retry_logger) {
                this._retry_logger.close();
                this._retry_logger._destruct();
                this._retry_logger = null;
            }
            this._retry_logger = this.logger.group("Try #" + this._retry_count, this.options.log_level);
            this._transport.logger = this._retry_logger
        } else {

            this._transport = this._create_transport();


            if (this._retry_logger) {

                this._retry_logger.close();
                this._retry_logger._destruct();
                this._retry_logger = null;
            }
            this._retry_logger = this.logger.group("Try #" + this._retry_count, this.options.log_level, this.logger);
            this._transport.logger = this._retry_logger
        }
        this._transport.connect();
    } catch (exc) {
        this.logger.error(exc);

        this._setReadyState(Connection.DEAD, exc);
        return;
    }

    if (this.options.retry.resend_buffer && send_buffer !== undefined) {
        this._transport._send_buffer = send_buffer;
    }
    if (!this._transport) {
        this._setIsOpen(false);
        this._retry = false;
        if (this.onclose) {
            this.onclose("unsupported", this.options.transport.factory + " transport unsupported");
        }
        return;
    }

};

Connection.prototype.open = function () {


    if (this._transport || this._is_retrying) {
        throw "connection already open (or opening or retrying)";
    }

    this._init();
    this._retry_connect(undefined, 5, true);
};

Connection.prototype.close = function (reason, message) {

    if (!this._transport && !this._is_retrying) {
        throw "connection already closed";
    }

    // the app wants to close .. don't retry
    this._retry = false;

    if (this.session && this.session.isOpen) {
        // if there is an open session, close that first.
        this.session.leave(reason, message);
    } else if (this._transport) {
        // no session active: just close the transport
        this._transport.close(1000);
    }
    this.logger.close();
    this.logger.clear();
};

Object.defineProperty(Connection.prototype, "_hasProperties", {
    get: function () {
        return true;
    }
});


Object.defineProperty(Connection.prototype, "defer", {
    get: function () {
        return this._defer;
    }
});


Connection.prototype._setIsOpen = function (val) {
    if (!this._hasProperties) {
        this.isOpen = val;
    }
};

Object.defineProperty(Connection.prototype, "isOpen", {
    get: function () {
        if (this.session && this.session.isOpen) {
            return true;
        } else {
            return false;
        }
    }
});

Connection.prototype._setIsConnected = function (val) {
    if (!this._hasProperties) {
        this.isConnected = val;
    }
};

Object.defineProperty(Connection.prototype, "isConnected", {
    get: function () {
        if (this._transport) {
            return true;
        } else {
            return false;
        }
    }
});

Object.defineProperty(Connection.prototype, "isRetrying", {
    get: function () {
        return this._is_retrying;
    }
});

Connection.prototype._setIsRetrying = function (val) {
    if (!this._hasProperties) {
        this.isRetrying = val;
    }
    this._is_retrying = val;
};
Object.defineProperty(Connection.prototype, "readyState", {
    get: function () {
        return this._readyState;
    }
});

Connection.prototype._setReadyState = function (val, evt) {
    if (!this._hasProperties) {
        this.readyState = val;
    }
    var old_state = this._readyState + 0;
    this._readyState = val;
    if (old_state !== this._readyState) {
        this._readyState = this._onreadystatechange(old_state, this._readyState, evt);
    }

};
Connection.prototype._onopen = function (evt) {

    this.session.logger = this._transport.logger.group("Session[id=" + this.session.id + ", realm=" + this.session.realm + "]",
        this.session.options.log_level !== undefined ?
            this.session.options.log_level : this.options.log_level);
    this._reset_retries();
    if (this.onopen) {
        this.onopen.call(this, this.session, evt);
    }
};
Connection.prototype._onunreachable = function (evt) {
    // try other factory
    if (this.onunreachable) {
        this.onunreachable(evt);
    }
    if (this._transports_unreachable.length + 1 < this._transport_factories.length) {
        this.logger.warn("Transport " + this.transport + " unreachable, switching transport");
        this._setReadyState(Connection.SWITCH_TRANSPORT, {"transport_id": this._transport_idx});
    } else {

        this._setReadyState(Connection.DEAD);
    }

};

Connection.prototype._onswitchtransport = function (evt) {
    if (this._transports_unreachable.indexOf(evt.transport_id) < 0) {
        this._reset_retries();
        this._switching_transport = true;
        this._transports_unreachable.push(evt.transport_id);
        if (this.onswitchtransport) {
            evt.unreachable_transports = [];
            this._transport_factories[evt.transport_id];
            for (var i = 0; i < this._transports_unreachable.length; i++) {

                evt.unreachable_transports.push(this._transport_factories[this._transports_unreachable[i]].type);

            }
            evt.available_transports = [];
            evt.retry = true;
            for (var i = 0; i < this._transport_factories.length; i++) {
                if (this._transports_unreachable.indexOf(i) < 0) {
                    evt.available_transports.push(this._transport_factories[i].type);
                }
            }
            this.onswitchtransport.call(this, evt);

            if (evt.retry === false) {
                clearTimeout(this._retry_timeout);
                this._setReadyState(Connection.ABORTED, evt);
                return;
            }
        }
        this._setReadyState(Connection.INIT, evt);
    }
};
Connection.prototype._onclosing = function (evt) {

    this.logger.info("Closing connection");

};
Connection.prototype._onlost = function (evt) {

    var retry_decision = this._automatic_reconnect(this._transport._send_buffer, this._retry_count === 0, evt);
    if (this.onlost) {
        this.onlost(retry_decision);
    }
};
Connection.prototype._ondead = function (evt) {
    this.logger.error("All transports failed, connection is dead");
    if (this.ondead) {
        this.ondead.call(this, evt);
    }
};
Connection.prototype._doretry = function (evt) {
    var retry_decision = this._automatic_reconnect(this._transport._send_buffer, evt.wasOpen, evt);
    if (retry_decision.retry === false) {
        this._setReadyState(Connection.UNREACHABLE, retry_decision);
    } else {
        this._setReadyState(Connection.RETRYING, retry_decision);
    }
};
Connection.prototype._onretry = function (evt) {


    if (this.onretry) {
        this.onretry.call(this, evt);
        if (!evt.retry) {
            clearTimeout(this._retry_timeout);

            this._setReadyState(Connection.ABORTED, evt);
            return;
        }
    }
    this.logger.warn("retrying in " + evt.delay + " s");
};
Connection.prototype._onclose = function(evt) {
    this.logger.info("Connection closed:", evt);
};


Connection.prototype._onconnecting = function (evt) {
    this._setIsConnected(true);

    if (this._is_retrying) {
        this.logger.info("Reestablished connection after " + ((new Date().getTime() - this._retry_started_timestamp) / 1000) + " seconds");
    } else {
        this.logger.info("Established connection");
    }
    if (this._transport.logger) {
        this._transport.logger._destruct();
    }

    this.protocol = evt.protocol;

    this._serializer = this._load_serializer(this.protocol);
    this._transport.batched = this._serializer.batched || false;
    this._transport.mime_type = this._serializer.mime_type;
    this._transport.BINARY = this._serializer.BINARY;
    this._transport.logger = this.logger.group("Protocol[" + this.protocol + "][transport=" + this._transport.name + "]", this.options.log_level);
    this.session = new session.Session(this._load_protocol(this.protocol), this.protocol,
        this._serializer,
        this._transport, this._defer, this.options.session);

    _SessionMixin.apply(this, this.session);

    this._setIsRetrying(false);

    this.session.join(this.options.realm, this.options.authmethods);
};

Connection.prototype._make_event = function (evt, old_state) {
    evt = evt || {};
    if (!evt.code) {
        evt.code = -1;
    }
    if (!evt.msg) {
        evt.msg = "";
    }
    if (!evt.wasOpen) {
        evt.wasOpen = old_state === Connection.OPEN;
    }
    return evt;
};

Connection.prototype._onerror = function (evt) {
    this.logger.error("Error on connection:", evt);
};
Connection.prototype._onretryabort = function (evt) {
    this.logger.warn("Application aborted retry: ", evt);
    this._destroy_transport();
};

Connection.prototype._onswitchtransportaborted = function (evt) {
    this.logger.warn("Application aborted switching of transport: ", evt);
    this._destroy_transport();
};

Connection.prototype._onreadystatechange = function (old_state, new_state, evt) {
    evt = this._make_event(evt, old_state);
    var old_state_str = Connection.STATES[old_state + ""] || "*unknown*";
    var new_state_str = Connection.STATES[new_state + ""] || "*unknown*";

    switch (old_state) {
        case Connection.INIT:
            // was connecting => first try
            switch (new_state) {
                case Connection.CLOSED:
                    // connect error
                    this._onunreachable(evt);
                    break;
                case Connection.ERROR:
                    // connect error
                    this._onerror(evt);
                    break;
                case Connection.RETRYING:
                    // connect error
                    this._onretry(evt);
                    break;
                case Connection.CONNECTING:
                    // connect error
                    this._onconnecting(evt);
                    break;
                case Connection.DEAD:
                    // connect error
                    this._ondead(evt);
                    break;
                default :
                    this._throw_state_error(old_state, new_state);

            }
            break;
        case Connection.SWITCH_TRANSPORT:
            switch (new_state) {
                case Connection.INIT:
                    // switched transport
                    this._doretry(evt);
                    break;
                    break;
                case Connection.ABORTED:
                    // connect error
                    this._onswitchtransportaborted(evt);
                    break;
                default :
                    this._throw_state_error(old_state, new_state);
            }
            break;
        case Connection.CONNECTING:
            // was connecting => first try
            switch (new_state) {
                case Connection.OPEN:
                    // successfully connected
                    this._onopen(evt);
                    break;
                case Connection.CLOSED:
                    // connect error
                    this._onunreachable(evt);
                    break;
                case Connection.ERROR:
                    // connect error
                    this._onerror(evt);
                    break;
                default :
                    this._throw_state_error(old_state, new_state);

            }
            break;
        case Connection.ERROR:
            // was connecting => first try
            switch (new_state) {

                case Connection.CLOSED:
                    // connect error
                    this._doretry(evt);
                    break;
                case Connection.RETRYING:
                    // connect error
                    this._onretry(evt);
                    break;
                case Connection.INIT:
                    // connect error
                    this._doretry(evt);
                    break;
                default :
                    this._throw_state_error(old_state, new_state);

            }
            break;

        case Connection.OPEN:
            // was open => closing down
            switch (new_state) {
                case Connection.CLOSING:
                    // successfully connected
                    this._onclosing(evt);
                    break;
                case Connection.CLOSED:
                    // dirty close // no protocol close happened
                    this._onlost(evt);
                    break;
                case Connection.ERROR:
                    // dirty close // no protocol close happened
                    this._onerror(evt);
                    break;
                default :
                    this._throw_state_error(old_state, new_state);

            }
            break;
        case Connection.CLOSING:
            // was closing
            switch (new_state) {
                case Connection.CLOSED:
                    // initial connect error
                    this._onclose(evt);
                    break;
                default :
                    this._throw_state_error(old_state, new_state);

            }
            break;
        case Connection.CLOSED:
            // was closed
            switch (new_state) {
                case Connection.CONNECTING:
                    // initial connect error
                    this._onconnecting(evt);
                    break;
                case Connection.RETRYING:
                    // initial connect error
                    this._onretry(evt);
                    break;
                case Connection.OPEN:
                    // initial connect error
                    this._onopen(evt);
                    break;
                case Connection.UNREACHABLE:
                    // initial connect error
                    this._onunreachable(evt);
                    break;
                default :
                    this._throw_state_error(old_state, new_state);

            }
            break;

        case Connection.RETRYING:
            // was closed
            switch (new_state) {
                case Connection.UNREACHABLE:
                    // initial connect error
                    this._onunreachable(evt);
                    break;
                case Connection.ERROR:
                    // connect error
                    //this._onretry(evt);
                    break;
                case Connection.CLOSED:
                    // dirty close // no protocol close happened
                    this._onlost(evt);
                    break;
                case Connection.ABORTED:
                    // connect error
                    this._onretryabort(evt);
                    break;
                case Connection.CONNECTING:
                    // successfully connected
                    this._onconnecting(evt);
                    break;
                default :
                    this._throw_state_error(old_state, new_state);
            }
            break;
        case Connection.UNREACHABLE:
            // was closed
            switch (new_state) {
                case Connection.INIT:
                    // initial connect error
                    this._doretry(evt);
                    break;
                case Connection.DEAD:
                    // initial connect error
                    this._ondead(evt);
                    break;
                case Connection.SWITCH_TRANSPORT:
                    // switched transport
                    this._onswitchtransport(evt);
                    break;
                default :
                    this._throw_state_error(old_state, new_state);


            }
            break;
        case Connection.ABORTED:
            // was closed
            //this.logger.log(evt);


            break;
        default :
            this._throw_state_error(old_state, new_state);
    }
    return this._readyState;


};


Connection.prototype._throw_state_error = function (old_state, new_state) {
    throw new Error("Unknown state transition from: " + Connection.STATES["" + old_state] + " => " + Connection.STATES["" + new_state]);
};

exports.Connection = Connection;
