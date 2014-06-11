try {
   var autobahn;
   //console.log(window.autobahn);
   autobahn= require('autobahn');

} catch (e) {
   // when running in browser, AutobahnJS will
   // be included without a module system
    autobahn = window.autobahn;
}

var connection1 = new autobahn.Connection({
    url: 'ws://'+window.location.hostname+':8080/ws',
    log_level:autobahn.LOG_VERBOSE,
        transport: {
            longpoll:{
        options: {
            use:null
        }
    }
        }
    ,
        retry: {
            max_time:120
        },
    max_retry_delay:15,
    session: {
        log_level:autobahn.LOG_VERBOSE,

        events: {
            onchallenge: function(session, ch, extra) {
                return JSON.stringify({"username":"arno","password":"arno"});
            }
        }
    },
        authmethods:["plain"],
        realm: 'realm1'
    }
);
function log_time(now) {
    this.logger.debug(now);
}
function log_error(error) {
    this.logger.error("Call failed:", error);
}
var session1 = null;
var session_call_timeout=null;
get_time = function() {
    if(session_call_timeout) {
        clearTimeout(session_call_timeout);
    }
     if(!session1.lost) {


     session1.call('com.timeservice.now').then(log_time.bind(session1),
      log_error.bind(session1)
   );
    session_call_timeout=setTimeout(get_time.bind(session1),5000);
         }
};


connection1.onopen = function (new_session) {
    var self=this;
   session1 = new_session;
   session1.logger.debug("Session open.");
    session1.lost = false;
   get_time();
    window.onbeforeunload = function(evt) {
       self.close();
        console.clear();

    };

};



connection1.onclose = function (reason, details) {
    session1.lost = true;
   console.log("connection 1", reason, details);
}
connection1.onerror = function (code, reason, details) {

   console.log("connection error", code, reason, details);
}
connection1.open();



/*
var connection2 = new autobahn.Connection({
   url: 'ws://127.0.0.1:8080/ws',
   realm: 'realm1'}
);

var session2 = null;

connection2.onopen = function (new_session) {

   session2 = new_session;

   session2.call('com.timeservice.now').then(
      function (now) {
         console.log("S2 Current time:", now);
         //connection.close();
      },
      function (error) {
         console.log("Call failed:", error);
         //connection.close();
      }
   );
};

connection2.onclose = function (details) {
   console.log("connection 2", details);
}

connection2.open();
*/