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
var websocket = require('./websocket.js');
var util = require('./util.js');
var log = require('./log.js');
var longpoll = require('./longpoll.js');
var autobahn = require('./autobahn.js');

var _SessionMixin = new util.Mixin("session", {
    "onjoin": function (details) {
        this._session_id = this.session.id;
        this._setIsOpen(true);
        this._setReadyState(Connection.OPEN);
        this.session.logger = this._transport.logger.group("Session[id=" + this.session.id + ", realm=" + this.session.realm + "]",
            this.session.options.log_level !== undefined ?
                this.session.options.log_level : this.options.log_level);
        this._reset_retries();
        if (this.onopen) {
            this.onopen(this.session, details);
        }

    },
    "onleave": function (reason, details) {
        this._setIsOpen(false);
        this._setReadyState(Connection.CLOSED);
        this._session_id = null;
        this.session._setId(null);
        this.session.logger.remove();
        this._session_close_reason = reason;
        this._session_close_message = details.message;
        this._retry = false;
        this._transport.close(1000);
        //if(this.onerror) {
        //   this.onerror(-1,reason,details);
        //}
    }
});

var _TransportMixin = new util.Mixin("transport", {
    "onmessage": function (msg) {
        this.session.onmessage(msg);
    },
    "log": function (msg) {
        this.logger.log(msg);
    },
    "ontimeout": function (code, msg, res) {
        this._transport.onerror(code, msg, res);
    },
    "onerror": function (code, msg, res) {
        this._onerror_called = true;
        //this._setIsRetrying(false);
        if (this._session_id !== null) {

            this._transport.onclose({"wasClean": false});
        } else if (!this._is_retrying && this._transport && (typeof(this._transport._retry) === "undefined" || this._transport._retry)) {
            this._automatic_reconnect(this._transport._send_buffer, this._retry_count === 0, {code: code, msg: msg, res: res});
        }
        if (this.onerror) {
            this.onerror(code, msg, res);
        }
    },
    "onclose": function (evt) {

        var send_buffer = undefined;
        var reason = null;
        var was_open = this._retry_count === 0;
        var retry_decision;
        var stop_retrying = false;
        var details;

        this._is_retrying = false;
        this._setReadyState(Connection.CLOSED);


        if (this._connect_successes === 0) {
            reason = "unreachable";
            this._retry = false;

        } else if (!evt.wasClean) {
            reason = "lost";
        } else {
            reason = "closed";
        }


        if (this.session) {
            this._reset_session();
        }
        if (this._transport && this._transport.close) {
            send_buffer = this._transport.close();
        }
        this._transport = null;

        this._setIsOpen(false);

        this._onopen_called = false;


        // automatic reconnection
        //

        retry_decision=this._automatic_reconnect(send_buffer, was_open, evt);

        if (this.onclose) {
            if (this.session && this.session.id !== null) {


                details = {
                    reason: this._session_close_reason,
                    message: this._session_close_message,
                    retry_delay: retry_decision.delay,
                    will_retry: retry_decision.retry,
                    retry_count: this._retry_count
                };
                stop_retrying = this.onclose(reason, details);
                stop_retrying = stop_retrying || false;
            } else {
                stop_retrying = true;
            }
        }

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


    if (obj.retry_count <= this.options.max_retries) {
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
    this.user_defined_options = options;
    this._init_options();
    this._setReadyState(Connection.CLOSED);
};
Connection.CONNECTING = 0;
Connection.OPEN = 1;
Connection.CLOSING = 2;
Connection.CLOSED = 3;

Connection.default_options = {
    // retry options
    retry: {
        klass: RetryStrategy,
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
    transport: {
        factory: "websocket",
        longpoll:{
            klass: longpoll.LongPollSocket,
            options: longpoll.LongPollSocket.default_options
        },
        connect_timeout: null
    },
     // longpoll
    longpoll: {
        klass: longpoll.LongPollSocket,
        options: longpoll.LongPollSocket.default_options
    },
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
    this._init_transport();
    this._reset();

};
Connection.prototype._init_retry_strategy = function () {

    console.assert(typeof this.options.retry.klass.prototype === "object", "Retry strategy needs to be a class");
    console.assert(typeof this.options.retry.klass.prototype.determine === "function", "Retry strategy needs a determine method");
    console.assert(typeof this.options.retry.klass.prototype.reset === "function", "Retry strategy needs a reset method");
    this._retry_strategy = new this.options.retry.klass(this.options.retry.options);

};
Connection._deprecated_retry_options = {"max_retries": "max_retries","initial_retry_delay": "initial_delay",
                                        "max_retry_delay": "max_delay", "retry_delay_growth": "delay_growth",
                                        "retry_delay_jitter":"delay_jitter"};

Connection.prototype._migrate_deprecated_retry_options = function() {
    var old_option;
    var new_option;
    for(old_option in Connection._deprecated_retry_options) {
        if(this.options[old_option]!==false) {
            new_option=Connection._deprecated_retry_options[old_option];
            this.options.retry[new_option]=this.options[old_option];
            console.warn("Deprecated option '"+old_option+"' used, should use 'retry."+new_option+"' instead");
            this.options[old_option] = null;
            delete this.options[old_option];
        }
    }
};
Connection._mandatory_options = {
    url: true,
    realm: true
};
Connection.prototype._validate_mandatory_options = function() {
    var missing_options = [];
    var opt;
    for(opt in Connection._mandatory_options) {
        if(Connection._mandatory_options[opt] && !this.options[opt]) {
            missing_options.push(opt);

        }
    }
    if(missing_options.length>0) {
        console.assert(false, "Missing mandatory options '"+missing_options.join("','")+"'");
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
    this.logger = new log.Log("Connection[" + this.options.url + " @ " + now.toUTCString() + "]", this.options.log_level);
    this.logger.formatter = new log.TimeDeltaFormatter(this._started_at);
    this.logger.debug("Created connection object with options:", this.options);
};
Connection.prototype._init_protocols = function () {
    var i;
    if (this.options.protocols) {
        for (i = 0; i < this.options.protocols.length; i++) {
            console.assert(autobahn.protocols.isRegistered(this.options.protocols[i]), "Protocol '"+this.options.protocols[i]+"' has not been registered with autobahn.protocols");

        }

    }


};
Connection.prototype._init_transport = function () {
    // WAMP transport
    //
    var registered_protocols = autobahn.protocols.list();
    var protocols = this.options.protocols || registered_protocols;
    var transport_factory_klass = autobahn.transports.get(this.options.transport.factory);

    if (this.options.longpoll === true || this.options.longpoll === false) {

        this.options.longpoll = Connection.default_options.longpoll;
        this.options.longpoll.use = this.options.longpoll;
    }



    this._transport_factory = new transport_factory_klass(this.options.url,protocols, this.options.transport);

    this._transport = null;
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
    this._setReadyState(Connection.CLOSED);
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
    this._session_id = null;
    this._session_close_reason = null;
    this._session_close_message = null;
};






Connection.prototype._automatic_reconnect = function (send_buffer, was_open, error) {
    var now;
    var current_timestamp;
     var retry_time;
    var retry_object;
    var retry_decision;
    if (this._is_retrying) {
        this.logger.warn("Already retrying");
        return;
    }

    if (was_open) {
        this._connect_failures += 1;
        this.logger.error("Lost connection");
        this.logger.close();
        now= new Date();
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
    this._setIsRetrying(retry_decision.retry);
    if (retry_decision.retry === true) {
        if (this._retry_timeout) {
            clearTimeout(this._retry_timeout);
        }
        this._setReadyState(Connection.CONNECTING);
        this.logger.error("retrying in " + retry_decision.delay + " s");
        this._retry_timeout = setTimeout(this._retry_connect.bind(this, send_buffer), retry_decision.delay * 1000);
        this._retry_count += 1;
    } else {
        this.logger.error("Giving up on retrying in: " + retry_decision);
        this._setReadyState(Connection.CLOSED);
    }
    return retry_decision;

};

Connection.prototype._load_protocol = function (protocol) {

    var mod = autobahn.protocols.get(protocol);
    return mod.protocol;

};
Connection.prototype._on_transport_open = function (evt) {
// create a new WAMP session using the configured transport
    if (this._onopen_called === true) return;
    this._setIsConnected(true);
    this._setReadyState(Connection.CONNECTING);
    this._onopen_called = true;
    if (this._is_retrying) {
        this.logger.important("Reestablished connection after " + ((new Date().getTime() - this._retry_started_timestamp) / 1000) + " seconds");
    } else {
        this.logger.important("Established connection");
    }
    if (this._transport.logger) {
        this._transport.logger._destruct();
    }
    this._transport.logger = this.logger.group("Protocol[" + this._transport.protocol + "][transport=" + (this._transport.name === undefined? this.options.transport.factory:this._transport.name) + "]", this.options.log_level);
    this.session = new session.Session(this._load_protocol.bind(this), this._transport, this._defer, this.options.session);
    _SessionMixin.apply(this, this.session);
    this._session_close_reason = null;
    this._session_close_message = null;
    this._session_id = null;
    this._setIsRetrying(false);


    this._connect_successes += 1;
    this.session.join(this.options.realm, this.options.authmethods);

};
Connection.prototype.clearSendBuffer = function () {
    if (this._transport && this._transport._send_buffer) {
        this._transport._send_buffer = [];
    }
};


Connection.prototype.log = function () {
    if (this.session) {
        this.session.log.apply(this.session, arguments);
    } else {
        console.log.apply(this, arguments);
    }
};

Connection.prototype._create_transport = function() {
    if(this._transport) {
        if (typeof this._transport._destruct === "function") {

            this._transport._destruct();

        }
        this._transport = null;
    }
    this._transport = this._transport_factory.create();

    this._transport.onopen=this._on_transport_open.bind(this);


    if(this.options.transport && this.options.transport.connect_timeout) {
        this._transport.timeout = this.options.transport.connect_timeout;
    }
    _TransportMixin.apply(this, this._transport);
}
Connection.prototype._retry_connect = function (send_buffer) {

    try {


        if (this._transport && this._transport.logger) {

            this._transport.logger.close();
            this._transport.logger._destruct();
            this._transport.logger = null;
            this._transport.onopen = null;
            this._create_transport();

            if (this._retry_logger) {
                this._retry_logger.close();
                this._retry_logger._destruct();
                this._retry_logger = null;
            }
            this._retry_logger = this.logger.group("Try #" + this._retry_count, this.options.log_level);
            this._transport.logger = this._retry_logger
        } else {

            this._create_transport();
            if (this._transport.readyState === this._transport.OPEN && this._onopen_called === false) {
                this._on_transport_open({});
            } else {
                if (this._check_transport_timeout) {
                    clearTimeout(this._check_transport_timeout);
                }
                this._check_transport_timeout = setTimeout(this._check_transport_state.bind(this), 110);
            }


            if (this._retry_logger) {

                this._retry_logger.close();
                this._retry_logger._destruct();
                this._retry_logger = null;
            }
            this._retry_logger = this.logger.group("Try #" + this._retry_count, this.options.log_level, this.logger);
            this._transport.logger = this._retry_logger
        }
    } catch (exc) {
        this._transport.logger.error(exc);

        this._automatic_reconnect(null, false, exc);
    }


    if (typeof(this._transport.on_new_session) == "function") {
        this._transport.on_new_session();
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
Connection.prototype._check_transport_state = function () {
    if ((!this._transport || this._transport.readyState > 1) && !this._onopen_called && !this._onerror_called) {

        this._is_retrying = false;
        this._automatic_reconnect(null, false);
    }
};
Connection.prototype.open = function () {


    if (this._transport || this._is_retrying) {
        throw "connection already open (or opening or retrying)";
    }

    this._init();
    this._retry_connect();
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

Connection.prototype._setReadyState = function (val) {
    if (!this._hasProperties) {
        this.readyState = val;
    }
    this._readyState = val;
};



exports.Connection = Connection;
