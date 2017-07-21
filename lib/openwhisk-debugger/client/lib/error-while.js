/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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


