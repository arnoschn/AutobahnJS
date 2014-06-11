/**
 * Created by arno on 28/05/14.
 */


exports.encode = function(obj) {
    return JSON.stringify(obj.data);
}
exports.decode = function(obj) {
    return JSON.parse(obj);
}

exports.name = "json";