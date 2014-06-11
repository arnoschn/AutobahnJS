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


function Factory(url, protocols, options) {
    this.url = url;
    this.options = options;
    this.protocols = protocols;

    if(this.options.longpoll && this.options.longpoll.klass) {
        this._validate_lonpoll_transport(this.options.longpoll.klass);
    }
}

Factory.prototype.create = function() {
    if ('window' in global) {
      //
      // running in browser
      //
      if ("WebSocket" in window && this.options.longpoll.options.use !== true) {
         // Chrome, MSIE, newer Firefox
         if (this.protocols) {
            return new window.WebSocket(this.url, this.protocols);
         } else {
            return new window.WebSocket(this.url);
         }
      } else if ("MozWebSocket" in window && this.options.longpoll.options.use !== true) {
         // older versions of Firefox prefix the WebSocket object

         if (this.protocols) {
            return new window.MozWebSocket(this.url, this.protocols);
         } else {
            return new window.MozWebSocket(this.url);
         }
      } else if(this.options.longpoll.klass && this.options.longpoll.options.use !== false) {

         // create Long Poll
        var tp=null;
         if (this.protocols) {
            tp = new this.options.longpoll.klass(this.options.longpoll.options, this.url, this.protocols);
         } else {
            tp = new this.options.longpoll.klass(this.options.longpoll.options, this.url);
         }
        console.assert(typeof tp.readyState !== "undefined", "transport must provide property 'readyState'");
       return tp;
      } else {
          console.assert(false,"Could not find a websocket implementation and longpoll option is disabled");
      }

   } else {

      //
      // running on nodejs
      //

      // our WebSocket shim with W3C API
      var websocket = {};

      // these will get defined by the specific shim
      websocket.protocol = undefined;
      websocket.send = undefined;
      websocket.close = undefined;

      // these will get called by the shim.
      // in case user code doesn't override these, provide these NOPs
      websocket.onmessage = function () {};
      websocket.onopen = onopen;
      websocket.onclose = function () {};
      websocket.onerror = function () {};

      var self = this;

      // https://github.com/einaros/ws
      //
      (function () {

         var WebSocket = require('ws');
         var client;
          var protocols = self.protocols;
         if (protocols) {
            if (Array.isArray(protocols)) {
               protocols = protocols.join(',');
            }
            client = new WebSocket(self.url, {protocol: protocols});
         } else {
            client = new WebSocket(self.url);
         }

         websocket.send = function (msg) {
            client.send(msg, {binary: false});
         };

         websocket.close = function (code, reason) {
            client.close();
         };

         client.on('open', function () {
            websocket.onopen();
         });

         client.on('message', function (data, flags) {
            if (flags.binary) {

            } else {
               websocket.onmessage({data: data});
            }
         });

         client.on('close', function () {
         });

         client.on('error', function () {
         });

      })();

      return websocket;
   }
};
Factory.prototype._validate_lonpoll_transport = function(klass) {
    console.assert(typeof klass.prototype === "object", "options.transport must be a class");
    console.assert(typeof klass.prototype.send === "function", "transport must provide method 'send'");
    console.assert(typeof klass.prototype.onmessage === "function", "transport must provide method 'onmessage'");
    console.assert(typeof klass.prototype.onclose === "function", "transport must provide method 'onclose'");
    console.assert(typeof klass.prototype.onerror === "function", "transport must provide method 'onclose'");

};


exports.Factory = Factory;
