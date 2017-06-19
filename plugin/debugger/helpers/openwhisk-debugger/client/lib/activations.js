/*
 * Copyright 2015-2016 IBM Corporation
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

var pollIntervalMillis = 200,
    errorWhile = require('./error-while')

/**
 * Wait for activation completion
 *
 */
exports.waitForActivationCompletion = function waitForActivationCompletion(ow, eventBus, waitForThisAction, options) {
    return new Promise((resolve, reject) => {
	//
	// this is the poll function
	//
	var pollOnce = function(since) {
	    //
	    // scan the recent activations, looking for the
	    // anticipated activation by invoked-entity name
	    //
	    ow.activations.list({ limit: 1, name: waitForThisAction, since: since, docs: true }).then(list => {
		var allDone = false;
		for (var i = 0; i < list.length; i++) {
		    var activationDetails = list[i];

		    if (options && options.result) {
			activationDetails = activationDetails.response.result;
		    }
				
		    // print out the activation record
		    console.log(JSON.stringify(activationDetails, undefined, 4));

		    // let other async listeners know about it
		    eventBus.emit('invocation-done', activationDetails);

		    // and let the promise know about it
		    resolve(activationDetails);

		    allDone = true;
		    break;
		}
		
		if (!allDone) {
		    //
		    // not yet, try again in a little bit
		    //
		    setTimeout(() => pollOnce(since), pollIntervalMillis);
		}
		    
	    }).catch(errorWhile('listing activations', reject));
	};

	var since = options.since || Date.now();
	setTimeout(() => pollOnce(since), pollIntervalMillis);
    });
};

exports.mostRecentEnd = ow => {
    return new Promise((resolve, reject) => {
	/*var key = wskprops.AUTH;
	var ow = openwhisk({
	    api: api.host + api.path,
	    api_key: key,
	    namespace: '_' // special here, as activations are currently stored in the user's default namespace
	});*/

	ow.activations.list({ limit: 1, docs: true }).then(lastOne => {
	    //
	    // if no activations were found, then use "now"
	    //
	    resolve(lastOne[0].end || Date.now());
	}).catch(reject);
    });
};
   
