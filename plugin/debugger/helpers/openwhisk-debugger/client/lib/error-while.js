/**
 * Log an error, and continue
 *
 */
module.exports = function errorWhile(inOperation, callback) {
    return function(err) {
        if (err && err.statusCode === 404) {
            console.error('Error: entity does not exist while in this operation: ', inOperation);
            console.error(err)
        } else {
            console.error('Error ' + inOperation);
            console.error(err);
            console.error(err.stack)
        }
        
        if (callback) {
            callback();
        } else {
            throw err
        }
    };
};


