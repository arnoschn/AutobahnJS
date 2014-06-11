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


var debug = function () {};

if ('AUTOBAHN_DEBUG' in global && AUTOBAHN_DEBUG && 'console' in global) {
   debug = function () {
      console.log.apply(console, arguments);
   }
}
Log.VERBOSE = 10;
Log.DEBUG = 3;
Log.ERROR = 0;
Log.WARN = 1;
Log.INFO = 2;
Log.IMPORTANT = -1;

function Log(group,level, parent, pos) {
    this._log_level = level || Log.ERROR;
    this._group = group;
    this._children = [];
    this._parent= parent;
    this._pos = pos;
    this._group_is_open = false;
    if(!this._parent){
        this._open_group();
    }
    this.formatter = null;
}
Log.prototype.setLevel = function(level) {
    this._log_level = level;
    return this._log_level;
};
Log.prototype.getLevel = function() {
    return this._log_level;
};
Log.prototype._destruct = function() {
    this.remove();

};
Log.prototype._format = function(msg_parts) {
    msg_parts = Array.prototype.slice.call(msg_parts, 0);
    if(!this.formatter) return msg_parts;
    return this.formatter.format(msg_parts);
};
Log.prototype._close_children = function() {
    for(var c=0;c<this._children.length;c++) {
        this._children[c].close();
    }
};
Log.prototype.setGroup = function(g) {
    this._group = g;
    if(!this._parent && !this._group_is_open){
        this._open_group();
    }
};
Log.prototype._open_group = function() {

    if(this._group_is_open || !this._group) {
        return;
    }
    this._close_children();
    if(this._parent && !this._parent._group_is_open) {
        this._parent._open_group();
    }
    console.group(this._group);
    this._group_is_open=true;
};
Log.prototype.group = function(name, level) {
    var logger=new Log(name, level || this._log_level, this, this._children.length);
    logger.formatter = this.formatter;
    this._children.push(logger);
    return logger;
};
Log.prototype.remove = function() {
    this.close();
    if(this._parent){
        this._parent._children.splice(this._pos,1);
    } else {
        for(var idx=0;idx<this._children.length;idx++) {
            this._children[idx].remove();
            delete this._children[idx];

        }
    }
    this._children = [];
    this._parent = null;
    this.formatter = null;
    this._log_level = -1000;
};
Log.prototype.close = function() {
    if(!this._group_is_open) {
        return;
    }
    this._close_children();
    if(this._group) {

        console.groupEnd();
        this._group_is_open = false;
    }

};
Log.prototype.clear = function() {
    console.clear();
};
Log.prototype.debug = function() {
    if(this._log_level >= Log.DEBUG) {
        this._open_group();
        var msg=this._format(arguments);
        console.debug.apply(console, msg);

    }

};
Log.prototype.important = function() {
    if(this._log_level >= Log.IMPORTANT) {
        this._open_group();
        var msg=this._format(arguments);
        console.info.apply(console, msg);

    }

};
Log.prototype.warn = function() {
    if(this._log_level >= Log.WARN) {
        this._open_group();
        var msg=this._format(arguments);
        console.warn.apply(console, msg);

    }

};
Log.prototype.info = function() {
    if(this._log_level >= Log.INFO) {
        this._open_group();
        var msg=this._format(arguments);
        console.debug.apply(console, msg);

    }

};
Log.prototype.log = function() {

        this._open_group();
    var msg=this._format(arguments);
        console.log.apply(console, msg);


};
Log.prototype.error = function() {
    if(this._log_level >= Log.ERROR) {
        this._open_group();
        var msg=this._format(arguments);
        console.error.apply(console, msg);

    }

};
Log.prototype.verbose = function() {
    if(this._log_level >= Log.VERBOSE) {
        this._open_group();
        var msg=this._format(arguments);
        console.debug.apply(console, msg);

    }

};
function TimeDeltaFormater(start) {
    this._start = start
}
TimeDeltaFormater.prototype.format = function(msg_parts) {
    var now = Date.now() - this._start;

          var val=Math.round(now * 1000) / 1000;
          var unit="ms";

          if(val>60000*60*24*7) {
              var total_s=Math.floor(val/1000);
              var total_m=Math.floor(total_s/60);
              var total_h=Math.floor(total_m/60);
              var total_d = Math.floor(total_h/24);
              var w = Math.floor(total_d/7);
              var d = Math.floor(total_d - w * 24);
              var h = Math.floor(total_h - total_d * 24 - w * 7 * 24);
              var m =total_m - h*60 - d*24*60 - w*7*24*60;
              var s =total_s - m*60 - (h*60*60) - (d*24*60*60) - (w*7*24*60*60);
              val=w + " w "+ d +" d " + h + " h "+m+" min "+Math.round(s);
              unit="s";

          } else if(val>60000*60*24) {
              var total_s=Math.floor(val/1000);
              var total_m=Math.floor(total_s/60);
              var total_h=Math.floor(total_m/60);
              var d = Math.floor(total_h/24);
              var h = Math.floor(total_h - d * 24);
              var m =total_m - h*60 - (d*24*60*60);
              var s =total_s - m*60 - (h*60*60) - (d*24*60*60);
              val=d +" d " + h + " h "+m+" min "+Math.round(s);
              unit="s";

          } else if(val>60000*60) {
              var total_s=Math.floor(val/1000);
              var total_m=Math.floor(total_s/60);
              var h=Math.floor(total_m/60);
              var m =total_m - h*60;
              var s =total_s - m*60 - (h*60*60);
              val=h + " h "+m+" min "+Math.round(s);
              unit="s";

          }
          else if(val>60000) {
              var total_s=Math.floor(val/1000);
              var m=Math.floor(total_s/60);
              var s =total_s - m*60;
              val=m+" min "+Math.round(s);
              unit="s";


          } else if(val>1000) {
               var total_s=Math.floor(val/1000);
               var ms =val - total_s*1000;
              val=total_s+" s "+Math.round(ms);
              unit="ms";

          }
         var ts="["+val + " "+unit+"] ";
    msg_parts.unshift(ts);


    return msg_parts;
};
/**
 * Add a log class which wraps the section around it
 * and on log.close, does close the section
 * @type {Function}
 */
exports.debug = debug;
exports.Log = Log;
exports.TimeDeltaFormatter = TimeDeltaFormater;
