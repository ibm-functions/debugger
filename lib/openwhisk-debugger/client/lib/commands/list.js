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

var //created = require('./create').created,
    isDirectlyAttachedTo = require('../rewriter').isDirectlyAttachedTo,
    Namer = require('../namer')
    //ok = require('../repl-messages').ok,
    //ok_ = require('../repl-messages').ok_,
    //errorWhile = require('../repl-messages').errorWhile,

exports._list = function _list(ow, callback, type) {
    ow[type || 'actions']
	.list({ limit: 200 })
	.then(function onList(L) { callback(L, ow); }
	      /*errorWhile('fetching actions', callback)*/); // <!-- FIXME
};

exports.list = function list(ow, callback, type) {
    exports._list(ow, callback, type);
};

exports.listToConsole = function listToConsole(ow, options, next) {
    if (options.help) {
	return next();
    }

    console.log('Available actions:'.blue);
    function print(actions) {
	actions
	    .filter(action => options && options.full || !Namer.isDebugArtifact(action.name))
	    .forEach(action => {
		var attached = isDirectlyAttachedTo(action.name);
		var newly = false // created[action.name]; <-- FIXME?
		var tabbed = attached || newly;
		
		console.log('    ', action.name[attached ? 'red' : newly ? 'green' : 'reset']
			    + (tabbed ? '\t\t\t\t\t' : '')
			    + (attached ? 'attached'.red : '')
			    + (newly ? 'new'.green : ''));
	    });

	//ok_(next);
        next();
    }

    exports.list(ow, print);
};
