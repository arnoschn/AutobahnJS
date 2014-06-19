
var msgpack = require('../msgpack/browser.js');




var util = require('../util.js');
var when = require('when');
function get_byte_array(long) {
    // we want to represent the input as a 8-bytes array
    var byteArray = [0, 0, 0, 0];

    for ( var index = 0; index < byteArray.length; index ++ ) {
        var byte = long & 0xff;
        byteArray [ index ] = byte;
        long = long >> 8 ;
    }
    byteArray.reverse();
    return byteArray;
};

function get_long_from_array(arr) {
    // we want to represent the input as a 8-bytes array

    var long = 0;
    for ( var index = 0; index < arr.length; index ++ ) {
        long = long +  (arr[index] & 0xff);


    }
    return long;
};

function Serializer(options) {
    this.batched = options && options.batched;
    this._is_node = typeof window === "undefined";


};
Serializer.type = "msgpack";
Serializer.modes = ["batched"];
Serializer.mime_type = "text/plain";
Serializer.BINARY = true;

Serializer.prototype._convert_from_uint8_to_arraybuffer = function(buffer) {
    return buffer.buffer;
};
Serializer.prototype._convert_from_nodebuffer_to_arraybuffer = function(buffer) {
    var ab = new ArrayBuffer(buffer.length);

        var ints = new Uint8Array(ab);
        for(var i=0;i<buffer.length;i++) {
            ints[i]=buffer.readUInt8(i);
        }
    return ab;
};
Serializer.prototype._convert_to_arraybuffer = function(buffer) {
    if(typeof buffer === "object" && buffer.constructor === ArrayBuffer) return buffer;
    if(typeof buffer === "object" && buffer.constructor === Uint8Array) return this._convert_from_uint8_to_arraybuffer(buffer);
    if(typeof buffer === "object" && buffer.constructor === Buffer) return this._convert_from_nodebuffer_to_arraybuffer(buffer);
    util.assert(false, "Could not convert input buffer: ",buffer," to ArrayBuffer");
};
Serializer.prototype.unserialize = function(buffer) {

    var objects = [];
    var data;
    var messages = [];




    data = this._convert_to_arraybuffer(buffer);






    if(this.batched) {
        var pos = 0;
        var view = new DataView(data);
        while(pos < data.byteLength - 1)
        {
            var field = [];
            for(var i=pos;i<pos+4;i++) {
                field.push(view.getUint8(i));
            }


            var len = get_long_from_array(field);
            var part = new ArrayBuffer(len);
            var ints = new Uint8Array(part);
            for(var i=0;i<len;i++) {
                ints[i]=view.getUint8(pos+4+i);
            }

            messages.push(part);
            pos = pos + 4 + len;
        }


    } else {

        messages = [data];

    }
    for(var i=0;i<messages.length;i++){
        objects.push(this._unserialize_item(messages[i]));
    }

     return objects;


};
Serializer.isSupported = function() {


    return typeof Uint8Array !== "undefined";

};
Serializer.prototype._unserialize_item = function(array) {

        return msgpack.decode(array);


};
Serializer.prototype.serialize = function(obj) {
    var result;
    if(this.batched) {
        var buffer = msgpack.encode(obj);
        var view=new DataView(buffer);
        var result = new Uint8Array(buffer.byteLength+4);
        var length_bytes = get_byte_array(buffer.byteLength);
        for(var i=0;i<length_bytes.length;i++) {
            result[i] = length_bytes[i];
        }
        for(var i=4;i<buffer.byteLength+4;i++) {
            result[i] = view.getUint8(i-4);
        }


    } else {


        result=msgpack.encode(obj);



    }

    return result;
};



exports.Serializer = Serializer;