/*
 * Copyright 2016-2017 IBM Corporation
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

const WebSocket = require('ws'),
      events = require('events'),
      eventBus = new events.EventEmitter(),
      rewriter = require('./rewriter'),
      mostRecentEnd = require('./activations').mostRecentEnd,
      waitForActivationCompletion = require('./activations').waitForActivationCompletion,
      debugNodeJS = require('./debug-nodejs').debug,
      debugSwift = require('./debug-swift').debug,
      debugPython = require('./debug-python').debug

//
// avoid multiple simultaneous debug sessions
//
let debugInProgress = false

//
// here, we memoize the websocket connection
//
let ws

/**
 * @param state restore this state from previous client sessions
 *
 */
const initWebSocket = (wsk, asyncNotifier, state, broker) => {
    if (!broker) {
        // for now...
        broker = {
            host: 'https://owdbg-broker.mybluemix.net',
            path: '/ws/client/register'
        }
    }

    ws = new WebSocket(broker.host + broker.path)

    ws.on('open', function open() {
        console.log('debugger::websocket is live');

        /*if (commandLineOptions) {
	    for (var x in commandLineOptions) {
	        if (commandLineOptions.hasOwnProperty(x)) {
		    console.log(('    + ' + commandLineOptionsConfig.find((o) => o.name === x).description).dim);
	        }
	    }
        }
        console.log();*/

        ws.send(JSON.stringify({
	    type: 'init',
	    key: wsk.auth.get()
        }))

        const keepAlive = setInterval(function poke() {
	    try {
	        ws.send(JSON.stringify({
		    type: 'keep-alive'
	        }));
	    } catch (e) {
	        console.error('Perhaps your network went offline (websocket to broker disconnected)');
		console.error(e)
		// TODO restore the connection! 20170620
                //setup(wsk, asyncNotifier, state, broker)
                ws = undefined
                clearInterval(keepAlive)
	    }
        }, 5000)

        /*process.on('SIGINT', () => {
	    //
	    // clean up all stubs
	    //
	    console.log('Cleaning up');
	    require('./rewriter').clean(wskprops, process.exit); // note: clean versus detachAll
        })*/

        process.on('exit', function onExit() {
	    try {
	        // console.log('Goodbye!'.red);
	        clearInterval(keepAlive);

	        ws.send(JSON.stringify({
		    type: 'disconnect'
	        }, function ack() {
		    ws.close();
	        }));
	    } catch (e) {
	    }
        });

        //repl(wskprops, eventBus, attachTo);
    });

    ws.on('close', function() {
        console.log('debugger::websocket::remote connection closed');
    })

    ws.on('message', function(data, flags) {
        //console.log('debugger::websocket::message ' + data + ' ||| ' + JSON.stringify(flags));
    
        //
        // flags.binary will be set if a binary data is received. 
        // flags.masked will be set if the data was masked.
        //
        try {
	    const message = JSON.parse(data);
	    switch (message.type) {
	    case 'invoke':
                console.log('debugger::invoke')
	        var circuitBreaker = function circuitBreaker() {
		    ws.send(JSON.stringify({
			type: 'circuit-breaker',
			key: message.key,
			activationId: message.activationId,
		    }));
	        };

	        if (debugInProgress) {
		    return circuitBreaker();
	        }

	        debugInProgress = true;
	    
	        console.log('Debug session requested');
	        // console.log(JSON.stringify(message, undefined, 4));

	        var done = function done(err, result) {
		    // console.log('Finishing up this debug session');

		    ws.send(JSON.stringify({
		        type: err ? 'circuit-breaker' : 'end',
		        key: message.key,
		        activationId: message.activationId,
		        result: result
		    }));

		    //ws.close();
	        };

	        if (message.onDone_trigger) {
		    if (message.action && message.action.exec) {
		        var kind = message.action.exec.kind;
		        var debugHandler;
		    
		        if (!kind || kind.indexOf('nodejs') >= 0) {
			    // !kind because nodejs is the default
			    debugHandler = debugNodeJS;
		        } else if (kind.indexOf('swift') >= 0) {
			    debugHandler = debugSwift;
		        } else if (kind.indexOf('python') >= 0) {
			    debugHandler = debugPython;
		        }

		        if (debugHandler) {
                            const commandLineOptions = {}
                            mostRecentEnd(wsk.ow)
                                .then(since => {
                                    const innerDone = msg => {
                                        console.log('innerDone', msg)
                                        const names = rewriter.lookup(message.onDone_trigger)
                                        if (names) {
                                            if (asyncNotifier) {
                                                waitForActivationCompletion(wsk.ow, eventBus, names.waitForThisAction, { since: since })
                                                    .then(asyncNotifier)
                                            } else {
                                                console.log('debug session done', names)
                                            }
                                        } else {
                                            console.error('could not find names for debug session', message.onDone_trigger)
                                        }

                                        done()
                                    }
			            debugHandler(message, ws, { trigger: message.onDone_trigger }, innerDone, commandLineOptions, eventBus);
                                })

		        } else {
			    console.error('Unable to complete invocation, because this action\'s kind is not yet handled: ' + kind);
			    circuitBreaker();
		        }

		    } else {
		        console.error('Unable to complete invocation: no action code to debug');
		        circuitBreaker();
		    }
	        } else {
		    console.error('Unable to complete invocation: no onDone_trigger specified');
		    circuitBreaker();
	        }

	        break;
	    }
        } catch (e) {
	    console.log(e);
        }
    }) /* end of on-message handler */
}

const setup = (wsk, asyncNotifier, state, broker) => {

    /**
     * The command handlers require a websocket connection. This
     * delegate pattern will ensure the websocket is active prior to
     * invoking the given command handler.
     *
     */
    const withWebSocket = handler => function() {
        //
        // make sure the websocket connection is active. note how the
        // initWebSocket code nulls out the ws variable when it
        // detects the connection has been severed
        //
        if (!ws) {
            initWebSocket(wsk, asyncNotifier, state, broker)
        }

        return handler.apply(undefined, arguments)
    }


    eventBus.on('invocation-done', () => {
	console.log('Debug session complete');
	debugInProgress = false
    });
    
    // FIXME globals
    //console.log('debugger::client::restoreState', state)
    if (state) {
        rewriter.restoreState(state)
    }

    return {
        invoke: withWebSocket(rewriter.invoke(wsk.ow, eventBus)),
        attach: withWebSocket(rewriter.attach(wsk.ow)),
        detach: withWebSocket(rewriter.detach(wsk.ow)),
        clean: withWebSocket(rewriter.clean(wsk.ow))
    }
} /* setup */


//
// initialize the dependencies, then call setup, which initializes the websocket, etc.
//
//module.exports = (wsk, asyncNotifier, state, broker) => require('./init').init().then(() => setup(wsk, asyncNotifier, state, broker))
module.exports = (wsk, asyncNotifier, state, broker) => setup(wsk, asyncNotifier, state, broker)
