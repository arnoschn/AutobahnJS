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


function rand_normal(mean, sd) {
   // Derive a Gaussian from Uniform random variables
   // http://en.wikipedia.org/wiki/Box%E2%80%93Muller_transform
   var x1, x2, rad, c;
 
   do {
      x1 = 2 * Math.random() - 1;
      x2 = 2 * Math.random() - 1;
      rad = x1 * x1 + x2 * x2;
   } while (rad >= 1 || rad === 0);
 
   c = Math.sqrt(-2 * Math.log(rad) / rad);
 
   return (mean || 0) + (x1 * c) * (sd || 1);
};
function deepCopy(p,c) {
    var i;
var c = c||{};
for (i in p) {
  if (typeof p[i] === 'object' && p[i]!==null && p[i]!==undefined) {
    c[i] = (p[i].constructor === Array)?[]:{};
    deepCopy(p[i],c[i]);
  } else c[i] = p[i];}
return c;
}


function Mixin(name, methods) {
    console.assert(typeof name === 'string', "name must be a string");
    console.assert(typeof methods === 'object', "methods must be an object");
    this.name = name;
    this.methods = methods;
}
Mixin.prototype._run_func = function(method) {
            if(arguments.caller) {
                var args=Array.prototype.slice.call(arguments.caller, 0)
            } else {
                var args = Array.prototype.slice.call(arguments, 1);
            }

            //args = Array.prototype.slice.call(args, 1);
            return method.apply(this,args);
        };
Mixin.prototype.apply = function(myThis, obj) {

    console.assert(typeof myThis === 'object', "myThis must be an object");
    console.assert(typeof obj === 'object', "obj must be an object");

    if(!obj._mixins) {
        obj._mixins = {};
        obj._destruct_object = obj._destruct;
        obj._destruct = this._destruct.bind(obj, obj._destruct_obj);
        obj._destruct_mixin = this._destruct_mixin.bind(obj);
    }
    var name=this.name;
    obj._mixins[name] = this;
    for (var func in this.methods) {

        obj[func] = this._run_func.bind(myThis, obj._mixins[name].methods[func]);
    }

};
Mixin.prototype._destruct = function(destruct_object_func) {
    for(var mixin in this._mixins) {
        this._destruct_mixin(mixin);
    }
    this._mixins = undefined;
    if(destruct_object_func) {
        destruct_object_func();
    }
    this._destruct = this._destruct_object;
    delete this._destruct_object;
    this._destruct = undefined;

    delete this._destruct;
    this._destruct_mixin = null;
    delete this._destruct_mixin;

};
Mixin.prototype._destruct_mixin = function(name) {
    for(var func in this._mixins[name].methods) {
        this[func] = null;
        delete this[func];
    }


    this._mixins[name] = null;
    delete this._mixins[name];

};

function parseUri (str) {
	var	o   = parseUri.options,
		m   = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
		uri = {},
		i   = 14;

	while (i--) uri[o.key[i]] = m[i] || "";

	uri[o.q.name] = {};
	uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
		if ($1) uri[o.q.name][$1] = $2;
	});

	return uri;
};

parseUri.options = {
	strictMode: false,
	key: ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],
	q:   {
		name:   "queryKey",
		parser: /(?:^|&)([^&=]*)=?([^&]*)/g
	},
	parser: {
		strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
		loose:  /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
	}
};


function merge_options(default_options, options) {
    var opts = deepCopy(default_options);
    for(var option in options) {
        if(typeof options[option] === "object" && options[option]!==null && options[option]!==undefined) {
            if(options[option].constructor === Array) {
                opts[option] = options[option];
            } else {
                opts[option] = merge_options(opts[option], options[option]);
            }
        } else {
            opts[option] = options[option];
        }
    }
    return opts;
}

exports.rand_normal = rand_normal;
exports.Mixin = Mixin;
exports.parseUri = parseUri;
exports.deepCopy = deepCopy;
exports.merge_options = merge_options;
