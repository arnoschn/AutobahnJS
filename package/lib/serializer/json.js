function Serializer(options) {
    this.type = "json";
    this.batched = options && options.batched;
};
Serializer.type = "json";
Serializer.modes = ["batched"];
Serializer.mime_type = "application/json";
Serializer.BINARY = false;
Serializer.prototype.unserialize = function(message) {
    var objects = [];
    var messages;
    if(this.batched) {
        messages = message.split('\30');
        messages.pop();

    } else {
        messages = [message];
    }
    for(var i=0;i<messages.length;i++){
        objects.push(this._unserialize_item(messages[i]));
    }
    return objects;
};
Serializer.prototype._unserialize_item = function(raw_data) {
    return JSON.parse(raw_data);
};
Serializer.prototype.serialize = function(obj) {
    if(this.batched) {
        return JSON.stringify(obj) + '\30';
    } else {
        return JSON.stringify(obj);
    }
};
Serializer.isSupported = function() {
    return typeof JSON !== "undefined" && typeof JSON.stringify !== "undefined" && typeof JSON.parse !== "undefined";
};
exports.Serializer = Serializer;