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

var fs = require('fs'),
    path = require('path'),
    //inquirer = require('inquirer'),
    errorWhile = require('./error-while'),
    mostRecentEnd = require('./activations').mostRecentEnd,
    waitForActivationCompletion = require('./activations').waitForActivationCompletion,
    lister = require('./commands/list'),
    Namer = require('./namer'),
    //ok = require('./repl-messages').ok,
    //ok_ = require('./repl-messages').ok_,
    //errorWhile = require('./repl-messages').errorWhile,
    invokerPackageNamespace = 'nickm@us.ibm.com_canary-advisor', // this is currently housed in one of nick's namespace
    invokerPackageName = 'owdbg',
    invokerActionName = 'invoker',
    invoker = invokerPackageName + '/' + invokerActionName,
    api = {
	host: 'https://openwhisk.ng.bluemix.net',
	path: '/api/v1'
    },
    debugBroker = {
	host: 'https://owdbg-broker.mybluemix.net'
    };

/** the dictionary of live attachments to actions */
var attached = {}, chainAttached = {}, lastAttached = {};

exports.lastAttached = lastAttached;
exports.isDirectlyAttachedTo = function isDirectlyAttachedTo(name) {
    return attached[name];
};
exports.isChainAttachedTo = function isChainAttachedTo(name) {
    return chainAttached[name];
};

function echoContinuation(entity, entityNamespace) {
    return {
	annotations: [{ key: 'debug', value: '/' + entityNamespace + '/' + entity }],
	exec: {
	    kind: 'nodejs:default',
	    code: 'function main(params) { return params; }'
	}
    };
}

function doWithRetry(promiseFunc) {
    return promiseFunc().catch((err) => doWithRetry(promiseFunc));
}

/**
 * Clean up any residual debugging artifacts
 *
 */
exports.clean = ow => () => {
    function cleanType(type) {
	var types = type + 's';
	// console.log('Cleaning ' + types);

	return new Promise(function(resolve, reject) {
	    lister.list(ow, function onList(entities, ow) {
		var toClean = entities.filter(function(entity) {
		    return Namer.isDebugArtifact(entity.name);
		});
		var counter = toClean.length;
		
		if (counter === 0) {
		    return resolve(toClean.length);
		}
		function _countDown(resolver) {
		    if (--counter === 0) {
			resolver(toClean.length);
		    }
		}
		var countDownError = _countDown.bind(undefined, reject);
		var countDown = _countDown.bind(undefined, resolve);

		toClean.forEach(function(entity) {
		    var params = {};
		    params[type + 'Name'] = entity.name;
		    function clean() {
			ow[types].delete(params)
			    .then(countDown)
			    .catch(errorWhile('cleaning ' + entity.name, countDownError));
		    }
		    if (type === 'rule') {
			doWithRetry(() => ow.rules.disable(params).then(clean));
		    } else {
			clean();
		    }
		});
	    }, types);
	});
    }

    return Promise.all([cleanType('action'),
		        cleanType('trigger'),
		        cleanType('package')
		       ])
	.then(() =>
	      cleanType('rule')
	      .catch(errorWhile('cleaning rules')))
	.catch(errorWhile('cleaning actions and triggers'))
};

var UpstreamAdapter = {
    createNames: function createUpstreamAdapterNames(entity, continuationName) {
        const entityName = entity.name || entity
	return {
	    ruleName: Namer.name(entityName, 'continuation-rule'),
	    triggerName: Namer.name(entityName, 'continuation-trigger'),
	    continuationName: continuationName || Namer.name(entityName, 'continuation-action'),
	    createContinuationPlease: !continuationName,
	    debugStubName: Namer.name(entityName, 'stub')
	};
    },

    invokerFQN: function(entityNamespace, names) {
	return '/' + entityNamespace + '/' + names.debugStubName;// + '/' + invokerActionName;
    },
    invokerName: function(names) {
	return names.debugStubName;// + '/' + invokerActionName;
    },

    createInvoker: function createUpstreamAdapterInvoker_withActionClone(ow, names, actionBeingDebugged, actionBeingDebuggedNamespace) {
	return new Promise((resolve, reject) => {
	    fs.readFile(path.join(__dirname, '..', 'deps', 'invoker', 'owdbg-invoker.js'), (err, codeBuffer) => {
		if (err) {
		    reject(err);
		} else {
		    ow.actions.update({
			actionName: names.debugStubName,
			action: {
			    parameters: [{ key: 'action', value: actionBeingDebugged },
					 { key: 'namespace', value: actionBeingDebuggedNamespace },
					 { key: 'broker', value: debugBroker.host },
					 { key: 'onDone_trigger', value: names.triggerName }
					],
			    exec: {
				kind: 'nodejs:default',
				code: codeBuffer.toString('utf8')
			    }
			}
		    }).then(resolve).catch(reject);
		}
	    });
	});
    },
    createInvoker_usingPackageBinding: function createUpstreamAdapterInvoker_usingPackageBinding(ow, names, actionBeingDebugged, actionBeingDebuggedNamespace) {
	return ow.packages.update({ packageName: names.debugStubName,
				    package: {
					binding: {
					    namespace: invokerPackageNamespace,
					    name: invokerPackageName
					},
					parameters: [{ key: 'action', value: actionBeingDebugged },
						     { key: 'namespace', value: actionBeingDebuggedNamespace },
						     { key: 'onDone_trigger', value: names.triggerName }
						    ]
				    }
				  });
    },
    create: function createUpstreamAdapter(ow, actionBeingDebugged, actionBeingDebuggedNamespace, names) {
	try {
	    if (!names) {
		names = UpstreamAdapter.createNames(actionBeingDebugged.name || actionBeingDebugged);
	    }
	    var work = [
		ow.triggers.update(names), // create onDone_trigger
		UpstreamAdapter.createInvoker(ow, names, actionBeingDebugged, actionBeingDebuggedNamespace),
	    ];
	    if (names.createContinuationPlease) {
		work.push(ow.actions.update({ actionName: names.continuationName, action: echoContinuation(actionBeingDebugged,
													   actionBeingDebuggedNamespace) }));
	    }
	    return Promise.all(work)
		.then(() => ow.rules.update({ ruleName: names.ruleName, trigger: '/_/'+names.triggerName, action: '/_/'+names.continuationName }))
                .then(newRule => ow.rules.enable({ name: newRule.name }))
	        .then(() => names/*, errorWhile('creating upstream adapter part 2')*/);
	} catch (e) {
	    console.error(e);
	    console.error(e.stack);
	}
    }
};

/**
 * Does the given sequence entity use the given action entity located in the given entityNamespace?
 *
 */
var SequenceRewriter = {
    rewriteNeeded: function sequenceUses(sequenceEntityThatMaybeUses, entity, entityNamespace) {
	var fqn = '/' + entityNamespace + '/' + entity;

	return sequenceEntityThatMaybeUses.name !== entity
	    && sequenceEntityThatMaybeUses.exec && sequenceEntityThatMaybeUses.exec.kind === 'sequence'
	    && sequenceEntityThatMaybeUses.exec.components && sequenceEntityThatMaybeUses.exec.components.find((c) => c === fqn);
    }
};

var RuleRewriter = {
    /**
     * Does the given rule entity use the given action entity located in the given entityNamespace?
     *
     */
    rewriteNeeded: function ruleUses(ruleEntityThatMaybeUses, entity, entityNamespace, isAnInstrumentedSequence) {
	//var fqn = '/' + entityNamespace + '/' + entity;
	return ruleEntityThatMaybeUses.name !== entity
	    && (ruleEntityThatMaybeUses.action.name === entity
		|| isAnInstrumentedSequence[ruleEntityThatMaybeUses.action.name]);
    },

    rewrite: function cloneRule(ow, ruleEntityWithDetails, entity, entityNamespace, names, previouslyAttached) {
        // are we already attached?
        /*const already = previouslyAttached[entityKey(ruleEntityWithDetails)]
        if (already) {
            console.log('Already rewrote rule', ruleEntityWithDetails)
            return Promise.resolve(already)
        }*/

	if (ruleEntityWithDetails.action.name === entity) {
	    //
	    // then the rule is T => entity, so we can simply create a new rule T => debugStub
	    //
            console.log('Creating rule via first path', ruleEntityWithDetails.trigger.name, names.debugStubName, names)
	    return ow.rules.update({ ruleName: Namer.name(ruleEntityWithDetails, 'rule-clone'),
				     trigger: '/_/'+ruleEntityWithDetails.trigger.name,
				     action: '/_/'+names.debugStubName
				   })
                .then(newRule => ow.rules.enable({ name: newRule.name }).then(() => newRule))
		.then(newRule => chainAttached[ruleEntityWithDetails.name] = names);
	} else {
	    var details = chainAttached[ruleEntityWithDetails.action.name];
	    if (details) {
		//
		// this means the rule maps T => sequence, where the sequence directly contains entity [..., entity, ... ]
		//
		return ow.rules.update({ ruleName: Namer.name(ruleEntityWithDetails, 'rule-clone'),
					 trigger: '/_/'+ruleEntityWithDetails.trigger.name,
					 action: '/_/'+details.before
				       })
                    .then(newRule => ow.rules.enable({ name: newRule.name }).then(() => newRule))
		    .then(newRule => chainAttached[ruleEntityWithDetails.name] = names);
	    }
	}
    }
};


function beforeSpliceSplitter(element, replacement, A) { A = A.slice(0, A.indexOf(element)); A.push(replacement); return A; }
function afterSpliceSplitter(element, tackOnTheEnd, A) { A = A.slice(A.indexOf(element) + 1); return A; }
function makeSequenceSplicePart(ow, name, sequence, splitter) {
    var opts = {
	actionName: name,
	action: {
	    exec: {
		kind: sequence.exec.kind,
		code: '',
		components: splitter(sequence.exec.components)
	    }
	}
    };
    return ow.actions.update(opts);
}
function spliceSequence(ow, sequence, entity, entityNamespace, names, previouslyAttached) {
    try {
	var finalBit;/*{
	    actionName: Namer.name('action'),
	    action: echoContinuation(entity, entityNamespace, spliceNames.onDone_trigger)
	};*/
	
        // are we already attached?
        /*const already = previouslyAttached[entityKey(sequence)]
        if (already) {
            console.log('Already spliced sequence', sequence)
            return Promise.resolve(already)
        }*/

	var fqn = '/' + entityNamespace + '/' + entity;

	var afterSpliceContinuation = Namer.name(sequence, 'sequence-splice-after', `for-${sequence.name}`);
	var upstreamAdapterNames = UpstreamAdapter.createNames(sequence, afterSpliceContinuation);

	var beforeSpliceUpstream = UpstreamAdapter.invokerFQN(entityNamespace, upstreamAdapterNames);
	//var afterSpliceContinuation = '/' + entityNamespace + '/' + upstreamAdapterNames.continuationName;

	return Promise.all([
	    makeSequenceSplicePart(ow,
				   Namer.name(sequence, 'sequence-splice-before'),
				   sequence,
				   beforeSpliceSplitter.bind(undefined, fqn, beforeSpliceUpstream)),   // before: _/--upstream
	    makeSequenceSplicePart(ow,
				   afterSpliceContinuation,
				   sequence,
				   afterSpliceSplitter.bind(undefined, fqn, finalBit)) // after: -\__continuation

	]).then(beforeAndAfter => {
	    //
	    // after the breakpoint, continue with the afterSplice
	    //
	    return UpstreamAdapter.create(ow, entity, entityNamespace, upstreamAdapterNames)
		.then(() => {
		    //
		    // this sequence splice uses its own downstream trigger, not the generic one from the action splice
		    //
		    var names = {
			before: beforeAndAfter[0].name,
			after: beforeAndAfter[1].name,
			triggerName: upstreamAdapterNames.triggerName
		    };
		    chainAttached[sequence.name] = names;
		    return names;

		}, errorWhile('creating upstream adapter'));
	}, errorWhile('splicing sequence'));
    } catch (e) {
	console.error(e);
    }
}

function doPar(ow, type, entity, each) {
    return new Promise((resolve, reject) => {
	var types = type + 's';
	ow[types].list({ limit: 200 })
	    .then(entities => {
		var counter = entities.length;
		function countDown(names) {
		    if (--counter <= 0) {
			resolve();
		    }
		}
		entities.forEach(otherEntity => {
		    if (otherEntity.name === entity) {
			// this is the entity itself. skip, because
			// we're looking for uses in *other* entities
			countDown();

		    } else {
			var opts = { namespace: otherEntity.namespace };
			opts[type + 'Name'] = otherEntity.name;
			ow[types].get(opts)
			    .then(otherEntityWithDetails => each(otherEntityWithDetails, countDown))
			    .catch(errorWhile('processing one ' + type, countDown));
		    }
		});
	    })
	    .catch(errorWhile('processing ' + types, reject));
    });
}

/**
 * Attach to the given entity, allowing for debugging its invocations
 *
 * @param previouslyAttached any previous return value of this
 * function on this entity, so that we can attempt to avoid
 * double-attaching; this is a map keyed by entityKey
 *
 */
const entityKey = entity => `${entity.namespace}/${entity.name}`
exports.attach = ow => function attach(options, resolve, reject, entity, previouslyAttached = {}) {
    if (options.help) {
	// the user passed -h or --help, so there is nothing to do here
	return resolve();
    }
    if (!entity) {
	console.error('Error: Please specify an entity ');
	console.error();
	return reject();
    }

    try {
	var doAttach = function doAttach() {
	    console.log(`Attaching to ${entity}`, options, previouslyAttached);

            let entityNamespace = '_',
                key = entityKey({ name: entity, namespace: entityNamespace })

	    console.log('Creating action trampoline');
            //const already = previouslyAttached[key]
            //console.log(`Have we previously attached to ${entity}? ${!!already}`, already);
            (/*already ? Promise.resolve(already) :*/ UpstreamAdapter.create(ow, entity, entityNamespace)).then(names => {
		// remember the names, so that we can route invocations to the debug version
		attached[entity] = names;
		lastAttached = entity;

                // we will return this to the caller, so they can know what we did
                const newlyAttached = Object.assign({}, previouslyAttached)
                newlyAttached[key] = names
                const resolveWithModel = () => resolve({
                    attachedTo: newlyAttached,
                    state: exportState()
                })

		if (!options || !options.all) {
		    //
		    // user asked not to instrument any rules or sequences
		    //
		    //return ok_(next);
                    return resolveWithModel()
		}

		// remember all sequences that include action, so that we can properly handle rules T -> sequence(..., action, ...)
		var isAnInstrumentedSequence = {};
		doPar(ow, 'action', entity, (otherEntityWithDetails, countDown) => {
                    //console.log('AAAAAAAAAAAAAAAAAAA', otherEntityWithDetails)
		    if (SequenceRewriter.rewriteNeeded(otherEntityWithDetails, entity, entityNamespace)) {
			//
			// splice the sequence!
			//
			console.log('Creating sequence splice', otherEntityWithDetails.name);
			isAnInstrumentedSequence[otherEntityWithDetails.name] = true;
			spliceSequence(ow, otherEntityWithDetails, entity, entityNamespace, names, previouslyAttached)
                            .then(model => newlyAttached[entityKey(otherEntityWithDetails) = model])
			    .then(countDown)
			    .catch(errorWhile('creating sequence splice', countDown));
			
		    } else {
			countDown();
		    }
		}).then(() => {
		    doPar(ow, 'rule', entity, (otherEntityWithDetails, countDown) => {
			if (RuleRewriter.rewriteNeeded(otherEntityWithDetails, entity, entityNamespace, isAnInstrumentedSequence)) {
			    //
			    // clone the rule!
			    //
			    console.log('Creating rule clone', otherEntityWithDetails.name);
			    RuleRewriter.rewrite(ow, otherEntityWithDetails, entity, entityNamespace, names, previouslyAttached)
                                .then(model => newlyAttached[entityKey(otherEntityWithDetails)] = model)
				.then(countDown, errorWhile('creating rule clone', countDown))
			} else {
			    countDown();
			}
		    }).then(resolveWithModel).catch(resolveWithModel);
		}).catch(reject);
	    });
	}; /* end of doAttach */
	
	//
	// first fetch the action to make sure it exists (at least for now)
	//
	return ow.actions.get({ actionName: entity })
	    .then(doAttach)
	    .catch(reject)
	
    } catch (e) {
	console.error(e);
        reject(e)
    }
};

exports.detachAll = ow => function detachAll(next) {
    var count = 0;
    function done() {
	if (--count <= 0) {
	    if (next) {
		next();
	    }
	}
    }
    
    for (var entity in attached) {
	if (attached.hasOwnProperty(entity)) {
	    count++;
	}
    }

    if (count === 0) {
	done();
    } else {
	for (entity in attached) {
	    if (attached.hasOwnProperty(entity)) {
		exports.detach(ow)(done, entity);
	    }
	}
    }
};

function doDetach(ow, next, entity) {
    console.log('Detaching' + ' from ' + entity);

    function errlog(idx, noNext) {
	return function(err) {
	    if (err.indexOf && err.indexOf('HTTP 404') < 0) {
		console.error('Error ' + idx, err);
	    }
	    if (!noNext) {
		next();
	    }
	};
    }
    
    var names = attached[entity];
    if (names) {
	try {
	    ow.rules.disable(names)
		.then(() => {
		    try {
			// first delete the action and rule and debug package
			Promise.all([ow.triggers.delete(names),
				     ow.actions.delete({ actionName: names.continuationName }),
				     ow.actions.delete({ actionName: names.debugStubName }) // keep in sync with UpstreamAdapter
				    ])
			    .then(() => {
				// then we can delete the rule
				ow.rules.delete(names)
				    .then(() => {
					try {
					    delete attached[entity];
					    ok_(next);
					} catch (err) {
					    errlog(5, true)(err);
					}
				    }).
				    catch(errlog(4));
			    })
			    .catch(errlog(3));
		    }
		    catch (err) { errlog(2, true)(err); }
		}).catch(errlog(1));
	} catch (err) {
	    errlog(0)(err);
	}
    }
}
exports.detach = ow => function detach(next, entity) {
    if (!entity) {
	var L = [];
	for (var x in attached) {
	    if (attached.hasOwnProperty(x)) {
		L.push(x);
	    }
	}
	if (L.length === 0) {
	    console.error('No attached actions detected');
	    next();
	} else {
	    /*inquirer
		.prompt([{ name: 'name', type: 'list',
			   message: 'From which action do you wish to detach',
			   choices: L
			 }])
		.then(function(response) { doDetach(ow, next, response.name); });*/
	}
    } else {
	doDetach(ow, next, entity);
    }
};

/**
 * Invoke an action
 *
 */
exports.invoke = (ow, eventBus) => (action, params) => {
    if (!action) {
	console.error('Please provide an action to invoke');
	return next();
    }

    const pair = exports.waitFor(action)
    const invokeThisAction = pair.invokeThisAction
    const waitForThisAction = pair.waitForThisAction
    console.log('Invoking', action, invokeThisAction, waitForThisAction);

    //
    // remember the time, so that the waitForActivationCompletion
    // doesn't look for previous invocations of the given action
    //
    return mostRecentEnd(ow)
	.then(since => ow.actions.invoke({ name: invokeThisAction, params: params, blocking: true })
	      .then(() => waitForActivationCompletion(ow, eventBus, waitForThisAction, { since: since })))
}

exports.waitFor = action => {
    let invokeThisAction, waitForThisAction;
    
    const attachedTo = attached[action];
    if (!attachedTo) {
	var seq = chainAttached[action];
	if (seq) {
	    if (seq.before) {
		// sequence
		invokeThisAction = seq.before;
		waitForThisAction = seq.after;
	    } else {
		// rule: invoke the rule's action
		invokeThisAction = seq.debugStubName;
		waitForThisAction = seq.continuationName;
	    }

	} else {
	    invokeThisAction = action;
	    waitForThisAction = action;
	}

    } else {
	invokeThisAction = UpstreamAdapter.invokerName(attachedTo);

	// these are now part of the debug stub binding
	// params.action = action;
	// params.namespace = namespace;
	// params.onDone_trigger = attachedTo.triggerName;

	waitForThisAction = attachedTo.continuationName;
    }

    return {
        invokeThisAction: invokeThisAction,
        waitForThisAction: waitForThisAction
    }
}

exports.lookup = continuationTrigger => {
    console.log('debugger::rewriter::lookup', continuationTrigger, attached)
    for (let action in attached) {
        if (attached[action].triggerName === continuationTrigger) {
            console.log('debugger:Lookup success', attached[action])
            return exports.waitFor(attached[action])
        }
    }

    for (let action in chainAttached) {
	var seq = chainAttached[action];
	if (seq) {
	    if (seq.before) {
		// sequence
                console.log('debugger:Lookup success with seq', seq.before, seq.after)
		return {
                    invokeThisAction: seq.before,
		    waitForThisAction: seq.after
                }
	    } else {
		// rule: invoke the rule's action
                console.log('debugger:Lookup success with rule', seq.debugStubName, seq.continuationName)
		return {
                    invokeThisAction: seq.debugStubName,
		    waitForThisAction: seq.continuationName
                }
	    }
	}
    }
}

/** restore state from previous session */
exports.restoreState = state => {
    console.log('debugger::rewriter::restoreState', state)
    if (state) {
        attached = state.attached || {}
        chainAttached = state.chainAttached || {}
        lastAttached = state.lastAttached || {}
    }
}
const exportState = () => ({
    attached: attached,
    chainAttached: chainAttached,
    lastAttached: lastAttached
})
