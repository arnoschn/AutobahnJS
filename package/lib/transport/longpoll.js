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


function Factory(options) {
    this.options = options;
    util.assert(this.options.url !== undefined, "options.url missing");
    util.assert(typeof this.options.url === "string" || (typeof this.options.url === "object" && typeof this.options.url.base === "string"), "options.url must be a string or an object with options.url.base");
}

Factory.type = "longpoll";

Factory.isSupported = function () {
    var xhr;
    if (typeof window === "undefined") {
        return false;
    } else {
        if(window.location.protocol === "file:") {
            return false;
        }
    }

    if (typeof XMLHttpRequest !== "undefined") {
        xhr = new XMLHttpRequest();
    } else if (ActiveXObject) {
        xhr = LongPollSocket._iexhr();
    }
    if (!xhr) {
        return false;
    }
    xhr = null;
    return true;
}
Factory.prototype.create = function () {
    var longpoll = new LongPollSocket(this.options);
    return longpoll;

};

function LongPollSocket(longpoll_options) {
    this.name = "longpoll";

    this._transport = null;
    this._requests = {};
    this._cors_resources = {};
    this._receive_timeout = false;
    this._init_transaction_ids();
    this._is_receiving = false;
    this._is_sending = false;
    this._defer = longpoll_options.defer;
    this._options = util.merge_options(LongPollSocket.default_options, longpoll_options);
    this._options.url = this._get_url_options(this._options.url);

    util.assert(this._options.url.base, "No base url provided");
    util.assert(this._options.url.send, "No send url provided");
    util.assert(this._options.url.receive, "No receive url provided");
    util.assert(this._options.url.open, "No open url provided");
    util.assert(this._options.url.close, "No close url provided");

    this._cors_needed = this._determine_if_cors_is_needed();

    this._options.protocols = this._options.protocols || ["wamp.2.json"];
    this.protocol = undefined;
    this._send_buffer = [];
    this._sender = null;
    this._is_closing = false;
    this._retry = true;
    this._connected = false;
    this._connecting = false;
    this.readyState = LongPollSocket.CLOSED;


}
LongPollSocket.prototype._init_transaction_ids = function () {
    this._transaction_ids = {"receive": 0, "send": 0};
};
LongPollSocket.prototype._create_transaction_url = function (type, url, additional_params) {
    if (this._cors_needed) {
        if (additional_params) {
            return url + "?" + additional_params;
        } else {
            return url;
        }

    } else {
        this._transaction_ids[type]++;
        if (additional_params) {
            return url + '?x=' + this._transaction_ids[type] + '&' + additional_params;
        } else {
            return url + '?x=' + this._transaction_ids[type];
        }

    }
};

LongPollSocket.prototype._determine_if_cors_is_needed = function () {
    var host = window.location.host;
    this.host = host;
    var longpoll_uri = util.parseUri(this._options.url.base);
    return longpoll_uri.authority != host;

};
LongPollSocket.prototype._get_url_options = function (url) {
    var uri;
    var url_object = {};
    if (typeof url === "object") {
        url_object = url;

    } else if (typeof url === "string") {
        uri = util.parseUri(url);
        if (uri.protocol == "ws") {
            // we got the default url from the connection config
            url = "http://" + uri.authority + "/longpoll";
        } else if (uri.protocol == "wss") {
            // we got the default url from the connection config
            url = "https://" + uri.authority + "/longpoll";
        }
        url_object.base = url;
        url_object = util.merge_options(LongPollSocket.default_options.url, url_object);


    }
    return url_object;

};
LongPollSocket.default_options = {
    transport: LongPollSocket,
    send_interval: 500,
    open_timeout: 30,
    send_timeout: 30,
    close_timeout: 10,
    receive_timeout: -1, // no timeout
    url: { base: null, send: "/send", open: "/open", receive: "/receive", close: "/close" }
};
LongPollSocket.CONNECTING = 0;

LongPollSocket.OPEN = 1;

LongPollSocket.CLOSING = 2;

LongPollSocket.CLOSED = 3;
LongPollSocket.prototype.send = function (payload) {
    if (!this._connected && !this._connecting) {
        console.warn("Socket not connected, buffering...");
    }

    this._send_buffer.push(payload);


};
LongPollSocket.prototype._destruct = function () {
    this._terminate_sockets();

};

LongPollSocket.prototype._on_receive_success = function (req, res) {
    this.logger.debug("receive ok", res);
    this.onmessage({data: res});
    this._is_receiving = false;


    if (!this._is_closing) {
        this._init_receiver();
    }
};
LongPollSocket.prototype._on_receive_failure = function (req, code) {


    this._is_receiving = false;
    if (code === 0 || (code >= 400 && code <= 999)) {
        // We lost our session??
        var was_connected = this._connected;
        this._close();
        was_connected && this.onclose({"code": code, "msg": req.response, "wasClean": false});
    } else if (code >= 1000) {
        var was_connected = this._connected;
        this._close();
        was_connected && this.onclose({"code": code, "msg": req.response, "wasClean": false});
    } else if (!this._is_closing) {
        this.onerror({"code": code, "msg": req.response, "wasClean": false});
        this._init_receiver();
    }
};
LongPollSocket.prototype.receive = function () {
    if (this._is_closing || this._is_receiving) return;
    this._is_receiving = true;
    this._request("receive", this._create_transaction_url("receive", this._options.url.base + '/' + this._transport + this._options.url.receive),
        undefined, {timeout: this._options.receive_timeout, ontimeout: this._init_receiver.bind(this)}).then(
            this._on_receive_success.bind(this, this._requests["receive"]),
            this._on_receive_failure.bind(this, this._requests["receive"])
        );
};
LongPollSocket.prototype._on_close_success = function (req, code, reason, res) {

    this.readyState = LongPollSocket.CLOSED;
    this.logger.debug("closed successfully");

    if (this.onclose) {
        this.onclose({wasClean: true, code: code, msg: reason});
    }
    return this._closed();
};
LongPollSocket.prototype._on_close_failure = function (req, code, reason) {

    this.readyState = LongPollSocket.CLOSED;
    console.error("closed with error", req);

    if (this.onclose) {
        this.onclose({wasClean: false, code: code, msg: reason});
    }

};
LongPollSocket.prototype._on_open_success = function (req, res) {

    this.readyState = LongPollSocket.OPEN;

    this.logger.debug("ok", res);
    var res = typeof res === "object" ? res : JSON.parse(res);

    this.logger.debug(res.transport);
    this._transport = res.transport;
    this.name = "longpoll(#" + this._transport + ')'
    this.protocol = res.protocol;
    this._send_buffer = [];
    this._transaction_ids = {"receive": 0, "send": 0};

    this._init_sender();
    this._init_receiver();
    this.onopen(this.protocol);
    this._connected = true;

};
LongPollSocket.prototype._on_open_failure = function (req, code) {

    this.readyState = LongPollSocket.CLOSED;
    var msg;
    try {
        msg = req.responseText;
    } catch (e) {
        msg = "";
    }
    this.onerror({wasClean: false, code: code, msg: msg});
    this.onclose({wasClean: false, code: code, msg: msg});

};
LongPollSocket.prototype.connect = function () {
    if (this._connecting) {
        console.warn("Already connecting");
        return;
    } else if (this._connected) {
        console.warn("Already connected");
        return;
    }
    this.readyState = LongPollSocket.CONNECTING;
    this._connecting = true;
    this._request("open", this._create_transaction_url("send", this._options.url.base + this._options.url.open), JSON.stringify({"protocols": this._options.protocols}),
        {"mime_type": "application/json", "timeout": this.timeout || this._options.open_timeout, ontimeout: this._close_timeout.bind(this, false)}).then(
            this._on_open_success.bind(this, this._requests["open"]), this._on_open_failure.bind(this, this._requests["open"]));
};
LongPollSocket.prototype.close = function (code, reason) {
    if (this._connected && !this._is_closing) {
        this._is_closing = true;
        try {
            this._request("close", this._create_transaction_url("send", this._options.url.base + "/" + this._transport + this._options.url.close), {reason: reason },
                {timeout: this._options.close_timeout, ontimeout: this._close_timeout.bind(this, false)}, false);
            return this._on_close_success(this._requests["close"], code, reason);
        } catch (exc) {
            return this._on_close_failure(this._requests["close"], code, reason);
        }


    }

};
LongPollSocket.prototype._close_timeout = function (trigger_error) {
    this._terminate_sockets();
    this._connected = false;
    this._connecting = false;
    this.readyState = LongPollSocket.CLOSED;
    trigger_error = trigger_error === undefined ? true : trigger_error;
    if (trigger_error) {
        this.onerror({code: -1, msg: "Timeout"});
    }

};
LongPollSocket.prototype._closed = function () {
    this._terminate_sockets();
    this._connected = false;
    this._connecting = false;
    this.readyState = LongPollSocket.CLOSED;
    return this._send_buffer;

};
LongPollSocket.prototype._close = function (code, reason) {
    this._terminate_sockets();
    this._connected = false;
    this._connecting = false;
    this.readyState = LongPollSocket.CLOSED;
    if (this.onerror) {
        var msg = "Socket was closed";
        if (code === 1000) {
            msg += " cleanly";
        } else {
            msg += " uncleanly";
        }
        this.onerror({code: code, msg: msg});
    }

    return this._send_buffer;
};

LongPollSocket.prototype.onmessage = function () {

};
LongPollSocket.prototype.onopen = function () {

};
LongPollSocket.prototype.onclose = function () {

};
LongPollSocket.prototype.onerror = function () {

};


LongPollSocket.prototype._terminate_sockets = function () {

    for (var k in this._requests) {
        try {
            this._requests[k].onreadystatechange = function () {
            };
        } catch (e) {

        }

        try {
            this._requests[k].abort();
        } catch (e) {

        }

        this._requests[k] = null;
        delete this._requests[k];

    }
};

LongPollSocket.prototype._on_send_success = function (req, res) {
    this.logger.debug("send result:", res, req);

    clearTimeout(this._sender);
    this._sender = null;
    this._init_sender();
};

LongPollSocket.prototype._on_send_failure = function (req, code) {
    var msg;
    try {
        msg = req.responseText;
    } catch (e) {
        msg = "";
    }
    this.onerror({code: code, msg: msg});
    if (code === 0 || code >= 400) {
        // We lost our session??
        this._sender = null;
        var was_connected = this._connected;
        this._close();
        was_connected && this.onclose({"code": code, "msg": msg, "wasClean": false});
    } else {
        clearTimeout(this._sender);
        this._sender = null;
        this._init_sender();

    }

};
function appendBuffer(buffer1, buffer2) {
    var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
    tmp.set(new Uint8Array(buffer1), 0);
    tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
    return tmp;
};
LongPollSocket.prototype._send_data = function () {

    if (this._send_buffer.length && (!this._requests["send"] || this._requests["send"].readyState == 4)) {
        var send_buffer;
        if (this.batched) {
            if (this.BINARY) {
                send_buffer = new Uint8Array(0);
                while (this._send_buffer.length > 0) {
                    send_buffer = appendBuffer(send_buffer, this._send_buffer.shift());
                }
            } else {
                send_buffer = this._send_buffer.join("");
                this._send_buffer = [];
            }


        } else {
            send_buffer = this._send_buffer.shift();

        }


        // send send_buffer ..

        this._request("send", this._create_transaction_url("send", this._options.url.base + '/' + this._transport + this._options.url.send), send_buffer,
            {timeout: this._options.send_timeout, ontimeout: this._close_timeout.bind(this)}).then(
                this._on_send_success.bind(this, this._requests["send"]),
                this._on_send_failure.bind(this, this._requests["send"])
            );

    } else {
        this._sender = null;
        this._init_sender();
    }
};
LongPollSocket.prototype._init_sender = function () {
    if (this._sender === null) {
        this._sender = setTimeout(this._send_data.bind(this), this._options.send_interval);
    }
};
LongPollSocket.prototype._init_receiver = function () {
    if (this._receive_timeout) {
        clearTimeout(this._receive_timeout);
    }
    this._receive_timeout = setTimeout(this.receive.bind(this), 100);
};

LongPollSocket.prototype._onreadystatechange = function (id, d, evt) {
    var response;
    if (this._requests[id].readyState === 4) {


        if (this._requests[id].status === 200) {
            if (this._requests[id].response && typeof this._requests[id].response === "object") {
                response = new Uint8Array(this._requests[id].response);
            } else {
                response = this._requests[id].responseText;
            }

            try {
                // var msg = JSON.parse(txt);
                d.resolve(response);
            } catch (Exc) {
                // empty receive with status 200 => timeout of session, failing,
                d.reject(this._requests[id].status, response, this._requests[id]);
            }


        } else if (this._requests[id].status === 204 || this._requests[id].status === 1223) {
            d.resolve();

        } else {
            if (this._requests[id].response && typeof this._requests[id].response === "object") {
                response = new Uint8Array(this._requests[id].response);
            } else {
                response = this._requests[id].responseText;
            }
            d.reject(this._requests[id].status, response, this._requests[id]);
        }

    } else {
        //

    }
};

LongPollSocket._iexhr = function () {
    try {
        return new ActiveXObject("Msxml2.XMLHTTP.6.0");
    }
    catch (e) {
    }
    try {
        return new ActiveXObject("Msxml2.XMLHTTP.3.0");
    }
    catch (e) {
    }
    try {
        return new ActiveXObject("Msxml2.XMLHTTP");
    }
    catch (e) {
    }
    //Microsoft.XMLHTTP points to Msxml2.XMLHTTP.3.0 and is redundant
    throw new Error("This browser does not support XMLHttpRequest.");
};

LongPollSocket.prototype._create_xhr = function () {

    if (typeof XMLHttpRequest !== "undefined") {
        xhr = new XMLHttpRequest();
    } else if (ActiveXObject) {
        xhr = LongPollSocket._iexhr();
    }
    if (!xhr) {
        throw new Error("Could not find a XMLHttpRequest implementation (node.js requires xmlhttprequest)");
    }

    return xhr;
};

LongPollSocket.prototype._cors_preflight = function (id, url) {
    if (!this._requests["_preflight:" + id]) {

        this._requests["_preflight:" + id] = this._create_xhr();


    }
    var d = this._defer();
    this._requests["_preflight:" + id].onreadystatechange = this._onreadystatechange.bind(this, "_preflight:" + id, d);
    this._requests["_preflight:" + id].open("OPTIONS", url);
    this._requests["_preflight:" + id].setRequestHeader("Access-Control-Request-Method", "POST");
    this._requests["_preflight:" + id].setRequestHeader("Access-Control-Request-Headers", "content-type");
    this._requests["_preflight:" + id].setRequestHeader("Origin", this.host);

    this._requests["_preflight:" + id].send();
    if (d.promise.then) {
        // whenjs has the actual user promise in an attribute
        return d.promise;
    } else {
        return d;
    }

};
LongPollSocket.prototype._failed_cors_preflight = function (d, id, url) {

    d.reject("Could not complete cors preflight");
    if (d.promise.then) {
        // whenjs has the actual user promise in an attribute
        return d.promise;
    } else {
        return d;
    }
};
LongPollSocket.prototype._request = function (id, url, data, options) {
    options = options || {};

    var d = this._defer();
    if (!this._requests[id]) {

        this._requests[id] = this._create_xhr()


    } else if (this._requests[id].readyState === 1 && async) {
        d.reject("Could not load resource");
        if (d.promise.then) {
            // whenjs has the actual user promise in an attribute
            return d.promise;
        } else {
            return d;
        }
    }


    if (this._cors_needed && !this._cors_resources[url]) {
        this._cors_preflight(id, url).then(this._do_request.bind(this, d, options, id, url, data), this._failed_cors_preflight.bind(this, d, id, url));
        if (d.promise.then) {
            // whenjs has the actual user promise in an attribute
            return d.promise;
        } else {
            return d;
        }
    } else {
        return this._do_request(d, options, id, url, data);
    }


};

LongPollSocket.prototype._do_request = function (d, options, id, url, data) {
    try {
        this._cors_resources[url] = true;
        this._requests[id].onreadystatechange = this._onreadystatechange.bind(this, id, d);
        var content_type = this.mime_type || options.mime_type;
        content_type = content_type + "; charset=x-user-defined";


        this._requests[id].open("POST", url);
        if (this.BINARY && typeof this._requests[id].responseType !== "undefined" && this._requests[id].responseType != this.binaryType) {

            this._requests[id].responseType = this.binaryType;
        } else {
            content_type = this.mime_type + "; charset=UTF-8";
        }
        if (this._requests[id].overrideMimeType) {
            this._requests[id].overrideMimeType(content_type);
        }
        if (this._requests[id].ontimeout !== undefined) {


            if (options.timeout > 0 && options.timeout != this._requests[id].timeout) {

                this._requests[id].timeout = options.timeout * 1000;


                if (options.ontimeout) {
                    this._requests[id].ontimeout = options.ontimeout;
                } else {
                    this._requests[id].ontimeout = null;
                }

            } else if (options.timeout < 1) {
                this._requests[id].ontimeout = null;
                if (this._requests[id].timeout !== undefined) {
                    this._requests[id].timeout = null;
                }
            }
        }

        this._requests[id].setRequestHeader("Content-Type", content_type);


    } catch (exc) {
        console.error("Error in request", exc);

        d.reject(exc);
        if (d.promise.then) {
            // whenjs has the actual user promise in an attribute
            return d.promise;
        } else {
            return d;
        }


    }

    try {
        if (data !== undefined) {


            this._requests[id].send(data);


        } else {
            this._requests[id].send();
        }
    } catch (exc2) {

        d.reject(exc2);


    }


    if (d.promise.then) {
        // whenjs has the actual user promise in an attribute
        return d.promise;
    } else {
        return d;
    }

};


exports.Factory = Factory;

