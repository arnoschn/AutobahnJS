
// generate a WAMP ID
//
var crypto = require('crypto-js');


function newid () {
   return Math.floor(Math.random() * 9007199254740992);
}


// PBKDF2-base key derivation function for salted WAMP-CRA
//
function derive_key (secret, extra) {
   if (extra && extra.salt) {
      var salt = extra.salt;
      var keylen = extra.keylen || 32;
      var iterations = extra.iterations || 10000;
      var key = crypto.PBKDF2(secret,
                              salt,
                              {
                                 keySize: keylen / 4,
                                 iterations: iterations,
                                 hasher: CryptoJS.algo.SHA256
                              }
      );
      return key.toString(crypto.enc.Base64);
   } else {
      return secret;
   }
}


function auth_sign (challenge, secret) {
   if (!secret) {
      secret = "";
   }

   return crypto.HmacSHA256(challenge, secret).toString(crypto.enc.Base64);
}





var _protocol = {
    "__init__": function() {
       // the WAMP session ID
       this._setId(null);

       // the WAMP realm joined
       this._setRealm(null);

       // the WAMP features in use
       this._setFeatures(null);

        // getSubscriptions in place;
       this._setSubscriptions({});

       // getRegistrations in place;
       this._setRegistrations({});
       // closing state
       this._goodbye_sent = false;
       this._transport_is_closing = false;

       // outstanding requests;
       this._publish_reqs = {};
       this._subscribe_reqs = {};
       this._unsubscribe_reqs = {};
       this._call_reqs = {};
       this._register_reqs = {};
       this._unregister_reqs = {};



       // incoming invocations;
       this._invocations = {};

       // prefix shortcuts for URIs
       this._prefixes = {};
    },
    "_protocol_violation" : function (reason) {
      this.session.log("failing transport due to protocol violation: " + reason);
      this._socket.close(1002, "protocol violation: " + reason);
   },
    "encode": JSON.stringify,
    "decode": JSON.parse,

"_setId":function(id) {

        this._id = id;
        this.session._setId(id);

},




"_setRealm": function(realm) {

        this._realm = realm;
    this.session._setRealm(realm);

},





"_setFeatures": function(features) {

      this._features = features;
    this.session._setFeatures(features);

},
    "_setSubscriptions": function(subscriptions) {

      this._subscriptions = subscriptions;
    this.session._setSubscriptions(subscriptions);

},
    "_setRegistrations": function(registrations) {

      this._registrations = registrations;
    this.session._setRegistrations(registrations);

}
};

    exports.protocol = _protocol;

    exports.newid = newid;
    exports.derive_key = derive_key;
    exports.auth_sign = auth_sign;


