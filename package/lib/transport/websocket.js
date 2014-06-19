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
var util = require('../util.js');

function AutobahnWebsocket(options, WebSocketClass) {
    this.options = options;
    this._is_opened = false;
    this._binaryType = "blob";
    this._timeout = -1;
    this._transport_class = WebSocketClass;
};

AutobahnWebsocket.CONNECTING = 0;
AutobahnWebsocket.OPEN = 1;
AutobahnWebsocket.CLOSING = 2;
AutobahnWebsocket.CLOSED = 3;
AutobahnWebsocket.prototype.connect = function() {
    this._init_client(this._transport_class);
    this._init_client_config();
    this._init_events();
};

AutobahnWebsocket.prototype._init_client = function(WebSocketClass) {
    if (this.options.protocols) {
        this._client = new WebSocketClass(this.options.url, this.options.protocols);

    } else {
        this._client =  new WebSocketClass(this.options.url);
    }

};
AutobahnWebsocket.prototype._init_client_config = function() {
    this._client.binaryType = this._binaryType;
    this._client.timeout = this._timeout;
};

AutobahnWebsocket.prototype._init_events = function() {

    this._client.onmessage = this.onmessage.bind(this);
    this._client.onopen = this._onopen.bind(this);
    if(this._client.readyState == AutobahnWebsocket.OPEN && !this._is_opened) {
        this.onopen(this._client.protocol);
    }
    this._client.onerror = this.onerror.bind(this);
    this._client.onclose = this.onclose.bind(this);
};
AutobahnWebsocket.prototype._onopen = function () {
    this._is_opened=true;
    this.onopen(this._client.protocol);
};
AutobahnWebsocket.prototype.onmessage = function () {
};
AutobahnWebsocket.prototype.onopen = function (protocol) {
    this._is_opened = false;
};
AutobahnWebsocket.prototype.onclose = function () {
};
AutobahnWebsocket.prototype.onerror = function () {
};

AutobahnWebsocket.prototype.send = function (msg, is_binary) {


    this._client.send(msg);
};


AutobahnWebsocket.prototype.close = function (code, reason) {

    this._client.close(code);
};




Object.defineProperty(AutobahnWebsocket.prototype, "readyState", {
    get: function () {

        if (!this._client) {
            return AutobahnWebsocket.CLOSED;
        }
        return this._client.readyState;
    }
});
Object.defineProperty(AutobahnWebsocket.prototype, "binaryType", {
    get: function () {

        if (!this._client) {
            return this._binaryType;
        }
        return this._client.binaryType;
    },
    set: function(val) {
        if (!this._client) {
            this._binaryType = val;
        } else {
            this._client.binaryType = val;
        }
    }
});
Object.defineProperty(AutobahnWebsocket.prototype, "timeout", {
    get: function () {

        if (!this._client) {
            return this._timeout;
        }
        return this._client.timeout;
    },
    set: function(val) {
        if (!this._client) {
            this._timeout = val;
        } else {
            this._client.timeout = val;
        }
    }
});

var NodejsWebsocket = util.inherits(AutobahnWebsocket);

NodejsWebsocket.prototype._init_client = function(WebSocketClass) {
    if (this.options.protocols) {
        var protocols = this.options.protocols;


        this._client = new WebSocketClass(this.options.url, protocols, {protocol: protocols.join(", ")});
    }
    else {
        this._client = new WebSocketClass(this.options.url);
    }
};
NodejsWebsocket.prototype._init_events = function() {
    var self = this
    this._client.on('open', function () {

        self.onopen(this.protocol);
    });
    this._client.on('message', function (data, flags) {

        self.onmessage({data: data});

    });


    this._client.on('close', this.onclose.bind(this));

    this._client.on('error', function () {

        self.onerror.apply(self, arguments);
    });
};
NodejsWebsocket.prototype.send = function (msg, is_binary) {


    this._client.send(msg, {}, function (error) {

        if (error != undefined) {
            self.onerror.apply(self, arguments);
        }
    });
};

function Factory(options) {
    this.options = options;
    util.assert(this.options.url !== undefined, "options.url missing");
    util.assert(typeof this.options.url === "string", "options.url must be a string");

}
Factory.isSupported = function () {
    try {


        if (typeof window === "undefined") {
            var WebSocket = require('ws');
            return true;
        } else {
            if ("WebSocket" in window) {
                // Chrome, MSIE, newer Firefox
                return true;
            } else if ("MozWebSocket" in window) {
                // older versions of Firefox prefix the WebSocket object

                return true;
            } else {
                return false;
            }
        }

    } catch (e) {
        return false;
    }
};
Factory.type = "websocket";

Factory.prototype.create = function (openfunc) {
    if ('window' in global) {

        //
        // running in browser
        //
        if ("WebSocket" in window) {
            // Chrome, MSIE, newer Firefox
            return new AutobahnWebsocket(this.options, window.WebSocket,openfunc);
        } else if ("MozWebSocket" in window) {
            // older versions of Firefox prefix the WebSocket object
            return new AutobahnWebsocket(this.options, window.MozWebSocket,openfunc);
        } else {
            return false;
        }

    } else {

        var WebSocket = require('ws');

        return new NodejsWebsocket(this.options, WebSocket,openfunc);


    }
};


exports.Factory = Factory;
