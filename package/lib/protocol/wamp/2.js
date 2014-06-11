/**
 * Created by arno on 28/05/14.
 */
    var when_fn = require("when/function");
var util=require("../../util.js");
var autobahn = require("../../autobahn.js");
var wamp = require("../../protocol/wamp");
var WAMP_FEATURES = {
   caller: {
      features: {
         caller_identification: true,
         progressive_call_results: true
      }
   },
   callee: {
      features: {
         progressive_call_results: true
      }
   },
   publisher: {
      features: {
         subscriber_blackwhite_listing: true,
         publisher_exclusion: true,
         publisher_identification: true
      }
   },
   subscriber: {
      features: {
         publisher_identification: true
      }
   }
};

var MSG_TYPE = {
   HELLO: 1,
   WELCOME: 2,
   ABORT: 3,
   CHALLENGE: 4,
   AUTHENTICATE: 5,
   GOODBYE: 6,
   HEARTBEAT: 7,
   ERROR: 8,
   PUBLISH: 16,
   PUBLISHED: 17,
   SUBSCRIBE: 32,
   SUBSCRIBED: 33,
   UNSUBSCRIBE: 34,
   UNSUBSCRIBED: 35,
   EVENT: 36,
   CALL: 48,
   CANCEL: 49,
   RESULT: 50,
   REGISTER: 64,
   REGISTERED: 65,
   UNREGISTER: 66,
   UNREGISTERED: 67,
   INVOCATION: 68,
   INTERRUPT: 69,
   YIELD: 70
};


var when = require('when');
var _protocol = util.deepCopy(wamp.protocol);

_protocol.join = function(realm, authmethods) {

    var details = {};

   this._goodbye_sent = false;
   this._setRealm(realm);


   details.roles = WAMP_FEATURES;

   if (authmethods) {
      details.authmethods = authmethods;
   }

   return [MSG_TYPE.HELLO, realm, details];
};
_protocol.leave = function(reason, message) {
    if (!reason) {
      reason = "wamp.close.normal";
   }

   var details = {};
   if (message) {
      details.message = message;
   }

   var msg = [MSG_TYPE.GOODBYE, details, reason];
    this._goodbye_sent = true;
    return msg;
};
_protocol.call = function(procedure, args, kwargs, options) {
    var request = wamp.newid();
   var d = this.session.defer();
   this._call_reqs[request] = [d, options];

   // construct CALL message
   //
   var msg = [MSG_TYPE.CALL, request, options || {}, procedure];
   if (args) {
      msg.push(args);
      if (kwargs) {
         msg.push(kwargs);
      }
   }

   if (d.promise.then) {
      // whenjs has the actual user promise in an attribute
      return [d.promise, msg];
   } else {
      return [d, msg];
   }
};
_protocol.publish = function(topic, args, kwargs, options) {
    var ack = options && options.acknowledge;
   var d = null;

   // create and remember new PUBLISH request
   //
   var request = wamp.newid();
   if (ack) {
      d = this.session.defer();
      this._publish_reqs[request] = [d, options];
   }

   // construct PUBLISH message
   //
   var msg = [MSG_TYPE.PUBLISH, request, options || {}, topic];
   if (args) {
      msg.push(args);
      if (kwargs) {
         msg.push(kwargs);
      }
   }




      if (d && d.promise.then) {
         // whenjs has the actual user promise in an attribute
         return [d.promise, msg];
      } else {
         return [d, msg];
      }

};
_protocol.subscribe = function(curie_or_topic, topic, handler, options) {
    // create an remember new SUBSCRIBE request
   //
   var request = wamp.newid();
   var d = this.session.defer();
   this._subscribe_reqs[request] = [d, curie_or_topic, handler, options];

   // construct SUBSCRIBE message
   //
   var msg = [MSG_TYPE.SUBSCRIBE, request];
   if (options) {
      msg.push(options);
   } else {
      msg.push({});
   }
   msg.push(topic);



   if (d.promise.then) {
      // whenjs has the actual user promise in an attribute
      return [d.promise, msg];
   } else {
      return [d, msg];
   }
};

_protocol.register = function(curie_or_procedure, procedure, endpoint, options) {
   // create an remember new REGISTER request
   //
   var request = wamp.newid();
   var d = this.session.defer();
   this._register_reqs[request] = [d, curie_or_procedure, endpoint, options];

   // construct REGISTER message
   //
   var msg = [MSG_TYPE.REGISTER, request];
   if (options) {
      msg.push(options);
   } else {
      msg.push({});
   }
   msg.push(procedure);



   if (d.promise.then) {
      // whenjs has the actual user promise in an attribute
      return [d.promise, msg];
   } else {
      return [d, msg];
   }
};
_protocol.unsubscribe = function(subscription) {

   if (!subscription.active || !(subscription.id in this._subscriptions)) {
      throw "subscription not active";
   }

   var subs = this._subscriptions[subscription.id];
   var i = subs.indexOf(subscription);

   if (i === -1) {
      throw "subscription not active";
   }

   // remove handler subscription
   subs.splice(i, 1);
   subscription.active = false;

   var d = this.session.defer();
    var msg = null;
   if (subs.length) {
      // there are still handlers on the subscription ..
      d.resolve(false);

   } else {

      // no handlers left ..

      // create and remember new UNSUBSCRIBE request
      //
      var request = wamp.newid();
      this._unsubscribe_reqs[request] = [d, subscription.id];

      // construct UNSUBSCRIBE message
      //
      msg = [MSG_TYPE.UNSUBSCRIBE, request, subscription.id];


   }

   if (d.promise.then) {
      // whenjs has the actual user promise in an attribute
      return [d.promise, msg];
   } else {
      return [d, msg];
   }
};
_protocol.unregister = function(registration) {

   if (!registration.active || !(registration.id in this._registrations)) {
      throw "registration not active";
   }

   // create and remember new UNREGISTER request
   //
   var request = wamp.newid();
   var d = this.session.defer();
   this._unregister_reqs[request] = [d, registration];

   // construct UNREGISTER message
   //
   var msg = [MSG_TYPE.UNREGISTER, request, registration.id];



   if (d.promise.then) {
      // whenjs has the actual user promise in an attribute
      return [d.promise, msg];
   } else {
      return [d, msg];
   }
};

_protocol._extractFeaturesFromRoles = function(roles) {
    var features={};
            if (roles.broker) {
               // "Basic Profile" is mandatory
               features.subscriber = {};
               features.publisher = {};

               // fill in features that both peers support
               if (roles.broker.features) {

                  for (var att in WAMP_FEATURES.publisher.features) {
                     features.publisher[att] = WAMP_FEATURES.publisher.features[att] &&
                                                     roles.broker.features[att];
                  }

                  for (var att in WAMP_FEATURES.subscriber.features) {
                     features.subscriber[att] = WAMP_FEATURES.subscriber.features[att] &&
                                                      roles.broker.features[att];
                  }
               }
            }

            if (roles.dealer) {
               // "Basic Profile" is mandatory
               features.caller = {};
               features.callee = {};

               // fill in features that both peers support
               if (roles.dealer.features) {

                  for (var att in WAMP_FEATURES.caller.features) {
                     features.caller[att] = WAMP_FEATURES.caller.features[att] &&
                                                  roles.dealer.features[att];
                  }

                  for (var att in WAMP_FEATURES.callee.features) {
                     features.callee[att] = WAMP_FEATURES.callee.features[att] &&
                                                  roles.dealer.features[att];
                  }
               }
            }

    return features;
};

/**
 * WAMP methods
 * @type {{}}
 * @private
 */

_protocol._methods = {};

_protocol._methods[MSG_TYPE.ERROR] = {};

_protocol._methods[MSG_TYPE.SUBSCRIBED] = function (msg) {
      //
      // process SUBSCRIBED reply to SUBSCRIBE
      //
      var request = msg[1];
      var subscription = msg[2];

      if (request in this._subscribe_reqs) {

         var r = this._subscribe_reqs[request];

         var d = r[0];
         var topic = r[1];
         var handler = r[2];
         var options = r[3];

         if (!(subscription in this._subscriptions)) {
            this._subscriptions[subscription] = [];
         }
         var sub = new wamp.Subscription(topic, handler, options, this, subscription);
         this._subscriptions[subscription].push(sub);
         this._setSubscriptions(this._subscriptions);
         d.resolve(sub);
         this._subscribe_reqs[request] = null;
         delete this._subscribe_reqs[request];

      } else {
         this._protocol_violation("SUBSCRIBED received for non-pending request ID " + request);
      }
   };



   _protocol._methods[MSG_TYPE.ERROR][MSG_TYPE.SUBSCRIBE] = function (msg) {
      //
      // process ERROR reply to SUBSCRIBE
      //
      var request = msg[2];
      var details = msg[3];
      var error = msg[4];

      // optional
      var args = msg[5];
      var kwargs = msg[6];

      if (request in this._subscribe_reqs) {

         var r = this._subscribe_reqs[request];

         var d = r[0];

         d.reject(error);
         this._subscribe_reqs[request] = null;
         delete this._subscribe_reqs[request];

      } else {
         this._protocol_violation("SUBSCRIBE-ERROR received for non-pending request ID " + request);
      }
   };



   _protocol._methods[MSG_TYPE.UNSUBSCRIBED] = function (msg) {
      //
      // process UNSUBSCRIBED reply to UNSUBSCRIBE
      //
      var request = msg[1];

      if (request in this._unsubscribe_reqs) {

         var r = this._unsubscribe_reqs[request];

         var d = r[0];
         var subscription = r[1];

         if (subscription in this._subscriptions) {
            var subs = this._subscriptions[subscription];
            // the following should actually be NOP, since UNSUBSCRIBE was
            // only sent when subs got empty
            for (var i = 0; i < subs.length; ++i) {
               subs[i].active = false;
            }
            delete this._subscriptions[subscription];
         }
         this._setSubscriptions(this._subscriptions);
         d.resolve(true);
         this._unsubscribe_reqs[request] = null;
         delete this._unsubscribe_reqs[request];

      } else {
         this._protocol_violation("UNSUBSCRIBED received for non-pending request ID " + request);
      }
   };



   _protocol._methods[MSG_TYPE.ERROR][MSG_TYPE.UNSUBSCRIBE] = function (msg) {
      //
      // process ERROR reply to UNSUBSCRIBE
      //
      var request = msg[2];
      var details = msg[3];
      var error = msg[4];

      // optional
      var args = msg[5];
      var kwargs = msg[6];

      if (request in this._unsubscribe_reqs) {

         var r = this._unsubscribe_reqs[request];

         var d = r[0];
         var subscription = r[1];

         d.reject(error);
         this._unsubscribe_reqs[request] = null;
         delete this._unsubscribe_reqs[request];

      } else {
         this._protocol_violation("UNSUBSCRIBE-ERROR received for non-pending request ID " + request);
      }
   };



   _protocol._methods[MSG_TYPE.PUBLISHED] = function (msg) {
      //
      // process PUBLISHED reply to PUBLISH
      //
      var request = msg[1];
      var publication = msg[2];

      if (request in this._publish_reqs) {

         var r = this._publish_reqs[request];

         var d = r[0];
         var options = r[1];

         var pub = new wamp.Publication(publication);
         d.resolve(pub);
         this._publish_reqs[request] = null;
         delete this._publish_reqs[request];

      } else {
         this._protocol_violation("PUBLISHED received for non-pending request ID " + request);
      }
   };



   _protocol._methods[MSG_TYPE.ERROR][MSG_TYPE.PUBLISH] = function (msg) {
      //
      // process ERROR reply to PUBLISH
      //
      var request = msg[2];
      var details = msg[3];
      var error = msg[4];

      // optional
      var args = msg[5];
      var kwargs = msg[6];

      if (request in this._publish_reqs) {

         var r = this._publish_reqs[request];

         var d = r[0];
         var options = r[1];

         d.reject(error);
         this._publish_reqs[request] = null;
         delete this._publish_reqs[request];

      } else {
         this._protocol_violation("PUBLISH-ERROR received for non-pending request ID " + request);
      }
   };


   _protocol._methods[MSG_TYPE.EVENT] = function (msg) {
      //
      // process EVENT message
      //
      // [EVENT, SUBSCRIBED.Subscription|id, PUBLISHED.Publication|id, Details|dict, PUBLISH.Arguments|list, PUBLISH.ArgumentsKw|dict]

      var subscription = msg[1];

      if (subscription in this._subscriptions) {

         var publication = msg[2];
         var details = msg[3];

         var args = msg[4] || [];
         var kwargs = msg[5] || {};

         var ed = new wamp.Event(publication, details.publisher);

         var subs = this._subscriptions[subscription];

         for (var i = 0; i < subs.length; ++i) {
            try {
               subs[i].handler(args, kwargs, ed);
            } catch (e) {
               this.session.logger.error("Exception raised in event handler", e);
            }
         }

      } else {
         this._protocol_violation("EVENT received for non-subscribed subscription ID " + subscription);
      }
   };


   _protocol._methods[MSG_TYPE.REGISTERED] = function (msg) {
      //
      // process REGISTERED reply to REGISTER
      //
      var request = msg[1];
      var registration = msg[2];

      if (request in this._register_reqs) {

         var r = this._register_reqs[request];

         var d = r[0];
         var procedure = r[1];
         var endpoint = r[2];
         var options = r[3];

         var reg = new wamp.Registration(procedure, endpoint, options, this, registration);

         this._registrations[registration] = reg;
         this._setRegistrations(this._registrations);
         d.resolve(reg);
         this._register_reqs[request] = null;
         delete this._register_reqs[request];

      } else {
         this._protocol_violation("REGISTERED received for non-pending request ID " + request);
      }
   };



   _protocol._methods[MSG_TYPE.ERROR][MSG_TYPE.REGISTER] = function (msg) {
      //
      // process ERROR reply to REGISTER
      //
      var request = msg[2];
      var details = msg[3];
      var error = msg[4];

      // optional
      var args = msg[5];
      var kwargs = msg[6];

      if (request in this._register_reqs) {

         var r = this._register_reqs[request];

         var d = r[0];

         d.reject(error);
        this._register_reqs[request] = null;
         delete this._register_reqs[request];

      } else {
         this._protocol_violation("REGISTER-ERROR received for non-pending request ID " + request);
      }
   };



   _protocol._methods[MSG_TYPE.UNREGISTERED] = function (msg) {
      //
      // process UNREGISTERED reply to UNREGISTER
      //
      var request = msg[1];

      if (request in this._unregister_reqs) {

         var r = this._unregister_reqs[request];

         var d = r[0];
         var registration = r[1];

         if (registration.id in this._registrations) {
            delete this._registrations[registration.id];
         }
         this._setRegistrations(this._registrations);
         registration.active = false;
         d.resolve();
           this._unregister_reqs[request]= null;
         delete this._unregister_reqs[request];

      } else {
         this._protocol_violation("UNREGISTERED received for non-pending request ID " + request);
      }
   };



   _protocol._methods[MSG_TYPE.ERROR][MSG_TYPE.UNREGISTER] = function (msg) {
      //
      // process ERROR reply to UNREGISTER
      //
      var request = msg[2];
      var details = msg[3];
      var error = msg[4];

      // optional
      var args = msg[5];
      var kwargs = msg[6];

      if (request in this._unregister_reqs) {

         var r = this._unregister_reqs[request];

         var d = r[0];
         var registration = r[1];

         d.reject(error);
        this._unregister_reqs[request] = null;
         delete this._unregister_reqs[request];

      } else {
         this._protocol_violation("UNREGISTER-ERROR received for non-pending request ID " + request);
      }
   };



   _protocol._methods[MSG_TYPE.RESULT] = function (msg) {
      //
      // process RESULT reply to CALL
      //
      var request = msg[1];
      if (request in this._call_reqs) {

         var details = msg[2];

         var args = msg[3] || [];
         var kwargs = msg[4] || {};

         // maybe wrap complex result:
         var result = null;
         if (args.length > 1 || Object.keys(kwargs).length > 0) {
            // wrap complex result is more than 1 positional result OR
            // non-empty keyword result
            result = new wamp.Result(args, kwargs);
         } else if (args.length > 0) {
            // single positional result
            result = args[0];
         }

         var r = this._call_reqs[request];

         var d = r[0];
         var options = r[1];

         if (details.progress) {
            if (options && options.receive_progress) {
               d.notify(result);
            }
         } else {
            d.resolve(result);
             this._call_reqs[request] = null;
            delete this._call_reqs[request];
         }
      } else {
         this._protocol_violation("CALL-RESULT received for non-pending request ID " + request);
      }
   };



   _protocol._methods[MSG_TYPE.ERROR][MSG_TYPE.CALL] = function (msg) {
      //
      // process ERROR reply to CALL
      //
      var request = msg[2];
      if (request in this._call_reqs) {

         var details = msg[3];
         var error = new autobahn.Error(msg[4], msg[5], msg[6]);


         var r = this._call_reqs[request];

         var d = r[0];
         var options = r[1];

         d.reject(error);
         this._call_reqs[request] = null;
         delete this._call_reqs[request];

      } else {
         this._protocol_violation("CALL-ERROR received for non-pending request ID " + request);
      }
   };

   _protocol._invocation_success = function (request, res) {
               // construct YIELD message
               // FIXME: Options
               //
               var reply = [MSG_TYPE.YIELD, request, {}];

               if (res instanceof Result) {
                  var kwargs_len = Object.keys(res.kwargs).length;
                  if (res.args.length || kwargs_len) {
                     reply.push(res.args);
                     if (kwargs_len) {
                        reply.push(res.kwargs);
                     }
                  }
               } else {
                  reply.push([res]);
               }

               // send WAMP message
               //
               this.session._send(reply);
            };
   _protocol._invocation_error = function (request, err) {
               // construct ERROR message
               // [ERROR, REQUEST.Type|int, REQUEST.Request|id, Details|dict, Error|uri, Arguments|list, ArgumentsKw|dict]

               var reply = [MSG_TYPE.ERROR, MSG_TYPE.INVOCATION, request, {}];

               if (err instanceof Error) {

                  reply.push(err.error);

                  var kwargs_len = Object.keys(err.kwargs).length;
                  if (err.args.length || kwargs_len) {
                     reply.push(err.args);
                     if (kwargs_len) {
                        reply.push(err.kwargs);
                     }
                  }
               } else {
                  reply.push('wamp.error.runtime_error');
                  reply.push([err]);
               }

               // send WAMP message
               //
               this.session._send(reply);
            };

   _protocol._methods[MSG_TYPE.INVOCATION] = function (msg) {
      //
      // process INVOCATION message
      //
      // [INVOCATION, Request|id, REGISTERED.Registration|id, Details|dict, CALL.Arguments|list, CALL.ArgumentsKw|dict]
      //
      var request = msg[1];
      var registration = msg[2];
      var self=this;
      var details = msg[3];
      // receive_progress
      // timeout
      // caller

      if (registration in this._registrations) {

         var endpoint = this._registrations[registration].endpoint;

         var args = msg[4] || [];
         var kwargs = msg[5] || {};

         // create progress function for invocation
         //
         var progress = null;
         if (details.receive_progress) {

            progress = function (args, kwargs) {
               var progress_msg = [MSG_TYPE.YIELD, request, {progress: true}];

               args = args || [];
               kwargs = kwargs || {};

               var kwargs_len = Object.keys(kwargs).length;
               if (args.length || kwargs_len) {
                  progress_msg.push(args);
                  if (kwargs_len) {
                     progress_msg.push(kwargs);
                  }
               }
               self.session._send(progress_msg);
            }
         };

         var cd = new wamp.Invocation(details.caller, progress);

         // We use the following whenjs call wrapper, which automatically
         // wraps a plain, non-promise value in a (immediately resolved) promise
         //
         // See: https://github.com/cujojs/when/blob/master/docs/api.md#fncall
         //
         when_fn.call(endpoint, args, kwargs, cd).then(_protocol._invocation_success.bind(this, request),

            /**function (res) {
               // construct YIELD message
               // FIXME: Options
               //
               var reply = [MSG_TYPE.YIELD, request, {}];

               if (res instanceof Result) {
                  var kwargs_len = Object.keys(res.kwargs).length;
                  if (res.args.length || kwargs_len) {
                     reply.push(res.args);
                     if (kwargs_len) {
                        reply.push(res.kwargs);
                     }
                  }
               } else {
                  reply.push([res]);
               }

               // send WAMP message
               //
               self.session._send(reply);
            },*/
            _protocol._invocation_error.bind(this, request)
            /**function (err) {
               // construct ERROR message
               // [ERROR, REQUEST.Type|int, REQUEST.Request|id, Details|dict, Error|uri, Arguments|list, ArgumentsKw|dict]

               var reply = [MSG_TYPE.ERROR, MSG_TYPE.INVOCATION, request, {}];

               if (err instanceof Error) {

                  reply.push(err.error);

                  var kwargs_len = Object.keys(err.kwargs).length;
                  if (err.args.length || kwargs_len) {
                     reply.push(err.args);
                     if (kwargs_len) {
                        reply.push(err.kwargs);
                     }
                  }
               } else {
                  reply.push('wamp.error.runtime_error');
                  reply.push([err]);
               }

               // send WAMP message
               //
               self.session._send(reply);
            }*/
         );

      } else {
         this._protocol_violation("INVOCATION received for non-registered registration ID " + request);
      }
   };

_protocol._challenge_success = function (signature) {
                     var msg = [MSG_TYPE.AUTHENTICATE, signature, {}];
                     this.session._send(msg);
                  };
_protocol._challenge_error = function (err) {
                     this.session.logger.error("onchallenge() raised:", err);

                     var msg = [MSG_TYPE.ABORT, {message: "sorry, I cannot authenticate (onchallenge handler raised an exception)"}, "wamp.error.cannot_authenticate"];
                     this.session._send(msg);
                      // TODO: need to call session.close()
                     this.session._socket._retry = false;
                     this.session._socket.close(1000,"onchallenge() raised:"+err);
                  };
 _protocol.onmessage = function (evt, is_message) {

      is_message = typeof(is_message)=="undefined" ? false: is_message;
      var msg=null;
      if(!is_message) {
          msg = JSON.parse(evt.data);
      } else {
          msg = evt;
      }

      var msg_type = msg[0];

      // WAMP session not yet open
      //
      if (!this._id) {

         // the first message must be WELCOME, ABORT or CHALLENGE ..
         //
         if (msg_type === MSG_TYPE.WELCOME) {

            this._setId(msg[1]);

            // determine actual set of advanced features that can be used
            //
            var rf = msg[2];
            this._setFeatures(this._extractFeaturesFromRoles(rf.roles));
            this.session.onjoin(rf);
            if (this.session.events.onjoin) {
               this.session.events.onjoin(rf);
            }

         } else if (msg_type === MSG_TYPE.ABORT) {

            var details = msg[1];
            var reason = msg[2];
            this.session.onleave(reason,details);
            if (this.session.events.onleave) {
               this.session.events.onleave(reason, details);
            }


         } else if (msg_type === MSG_TYPE.CHALLENGE) {

            if (this.session.events.onchallenge) {

               var method = msg[1];
               var extra = msg[2];

               when_fn.call(this.session.events.onchallenge, this, method, extra).then(
                  _protocol._challenge_success.bind(this),
                  _protocol._challenge_error.bind(this)

               );


            } else {
               this.session.logger.error("received WAMP challenge, but no onchallenge() handler set");

               var msg = [MSG_TYPE.ABORT, {message: "sorry, I cannot authenticate (no onchallenge handler set)"}, "wamp.error.cannot_authenticate"];
               this.session._send(msg);
                // TODO: need to call session.close()
               this.session._socket._retry = false;
               this.session._socket.close(1000, "received WAMP challenge, but no onchallenge() handler set");

            }

         } else {
            this._protocol_violation("unexpected message type " + msg_type);
         }

      // WAMP session is open
      //
      } else {

         if (msg_type === MSG_TYPE.GOODBYE) {

            if (!this._goodbye_sent) {

               var reply = [MSG_TYPE.GOODBYE, {}, "wamp.error.goodbye_and_out"];
               this.session._send(reply);

            }

            this._setId(null);
            this._setRealm(null);
            this._setFeatures(null);

            var details = msg[1];
            var reason = msg[2];
            this.session.onleave(reason, details);
            if (this.session.events.onleave) {
               this.session.events.onleave(reason, details);
            }


         } else {

            if (msg_type === MSG_TYPE.ERROR) {

               var request_type = msg[1];
               if (request_type in _protocol._methods[MSG_TYPE.ERROR]) {

                  _protocol._methods[msg_type][request_type].call(this,msg);

               } else {

                  this._protocol_violation("unexpected ERROR message with request_type " + request_type);
               }

            } else {

               if (msg_type in _protocol._methods) {

                  _protocol._methods[msg_type].call(this, msg);

               } else {

                  this._protocol_violation("unexpected message type " + msg_type);
               }
            }
         }
      }

   };

_protocol["__init__"]=function() {
        wamp.protocol.__init__.call(this);
        this.session._socket.onmessage = this.onmessage;


};


exports.protocol = _protocol;
exports.name = "wamp.2";
