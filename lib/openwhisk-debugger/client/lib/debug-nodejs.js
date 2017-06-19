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

const fs = require('fs'),
    tmp = require('tmp'),
    diff = require('./diff'),
    kill = require('tree-kill'),
    open = require('open'),
    path = require('path'),
    spawn = require('child_process').spawn,
    nodeVersion = process.versions.node.split('.'),
    isOldNodeJS = nodeVersion[0] < 6  || nodeVersion[0] === 6 && nodeVersion[1] <= 2 ,
    isNewNodeJS6 = nodeVersion[0] === 6 && !isOldNodeJS

exports.debug = function debugNodeJS(message, ws, echoChamberNames, done, commandLineOptions, eventBus) {
    try {
        return exports._debug(message, ws, echoChamberNames, done, commandLineOptions, eventBus);
    } catch (e) {
        console.error(e);
    }
};
exports._debug = function debugNodeJS(message, ws, echoChamberNames, done, commandLineOptions, eventBus) {
    const originalCode = message.action.exec.code
    let code, needsBreakOnEntry;

    const r = new RegExp(/function main[\s]*\([^\)]*\)/);
    const startOfMethodBody = originalCode.search(r);
    if (startOfMethodBody >= 0) {
        var paren = originalCode.indexOf('{', startOfMethodBody);
        code = '\n\n\n\n'
        code += '//\n';
        code += '// Welcome to the OpenWhisk debugger\n';
        code += '//\n';
        code += '// Here is your action:\n';
        code += '//\n';
        code += originalCode.substring(0, paren + 1) + '\n    debugger;    // <-- inserted by the OpenWhisk debugger to break on main\n\n' + originalCode.substring(paren + 1);

        // we inserted the debugger line, so we don't need to break on entry
        needsBreakOnEntry = false
    } else {
        code = originalCode

        // we couldn't insert the debugger line, so we need a break on entry
        needsBreakOnEntry = true
    }

/*    var bootstrap = '\n\n\nvar result = main.apply(undefined, ' + JSON.stringify([message.actualParameters || {}]) + ');';

    // fire our echo chamber trigger when the code is done
    bootstrap += '\n\nvar openwhisk = require(\'openwhisk\');\n';
    bootstrap += 'ow = openwhisk({api: \'' + api.host + api.path + '\', api_key: \'' + message.key + '\', namespace: \'' + message.action.namespace + '\' });\n';
    bootstrap += 'ow.triggers.invoke({ triggerName: \'' + echoChamberNames.trigger + '\', params: result });\n';*/

    if (commandLineOptions['use-cli-debugger']) {
        // in CLI mode, try to save space with a terse message
        code += '\n\nconsole.log(\'Debug session initiated.\');\n';
        code += 'console.log(\'Enter the [cont] command to start your debugging session\');\n\n';
    } else {
        // in UI mode, we have more real estate for a longer message
        code += '\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n'
        code += '\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n'
        code += '\n\n\n\n\n//\n';
        code += '//\n';
        code += '// Ignore the boilerplate below\n';
        code += '//\n';
    }

    code += `require('debug-bootstrap')('${message.key}',
                                        '${message.action.namespace}',
                                        '${echoChamberNames.trigger}')(main,
                                                                       ${JSON.stringify(message.actualParameters || {})});`

    //
    // since we've modified the code, we need to remember the diffs *we* are responsible for,
    // so that we can ignore them when determining whether the user has modified the file
    //
    var removeBootstrapPatch = diff.createPatch(code, message.action.exec.code);
    
    tmp.dir({ prefix: 'wskdb-', unsafeCleanup: true}, function onTempDirCreation(err, tmpDirPath, tmpdirCleanupCallback) {
        // console.log('TMP ' + tmpdirPath);
        var tmpFilePath = path.join(tmpDirPath, message.action.name + '.js-debug');

        try {
            fs.writeFile(tmpFilePath, code, /*0,*/ 'utf8', function onFileWriteCompletion(err, written, string) {

            // we need to update the NODE_PATH env var, to add our local modules
            var env = Object.assign({}, process.env);
            env.NODE_PATH = path.join(__dirname, '..', 'node_modules')
                + ':' + path.join(__dirname, '..', 'lib')
                + ':' + path.join(__dirname, '..', 'deps', 'nodejs6', 'node_modules');

            function trySpawnWithBrowser(webPort, debugPort) {
                var spawnOpts = {
                    cwd: process.cwd(),
                    // stdio: ['inherit', 'inherit', 'inherit'], // for debugging
                    env: env
                };
                var child
                if (isOldNodeJS) {
                    // old, pre 6.3 nodejs
                    child = spawn(path.join(/*__dirname, '..',*/ 'node_modules', '.bin', 'node-debug'),
                                  ['--cli',
                                   '--debug-port', debugPort,
                                   '--web-port', webPort,
                                   '--save-live-edit',
                                   '--no-preload',
                                   '--hidden', '\.js$',
                                   tmpFilePath],
                                  spawnOpts);
                } else {
                    /*const argv = [`--inspect=${debugPort}`,
                                   //'--save-live-edit',
                                   //'--no-preload',
                                  //'--hidden', '\.js$'
                                 ]
                    if (!isNewNodeJS6) {
                        // node 7+ support break-on-enter
                        argv.push('--debug-brk')
                    }
                    argv.push(tmpFilePath)
                    child = spawn('node',
                                  argv,
                                  spawnOpts);*/

                    child = require('inspect-process')(tmpFilePath, {
                        // inspectOptions: { 'log-level': 'silly' },  // helpful for debugging
                        nodeArgs: needsBreakOnEntry ? [ '--debug-brk' ] : [],
                        childOptions: spawnOpts,
                        devtoolsOptions: { width: window.innerWidth, height: window.innerHeight,
                                           windowPosition: { left: window.screenX, top: window.screenY }
                                         }
                    })
                }
                var child2;
                var addrInUse = false;

                //
                // a bit of a hack here: wait a bit to see if we get an EADDRINUSE on stderr
                //
                if (!child.then) {
                    setTimeout(() => child.stdout.on('data', function(data) {
                        if (!child2 && !addrInUse) {
                            if (isOldNodeJS) {
                                var url = 'http://127.0.0.1:' + webPort + '/?port=' + debugPort
                                child2 = open(url, 'Google Chrome');
                            }

                        /*console.log('');
                        console.log('');
                        console.log('\tVisit ' + url.underline + ' in the ' + 'Chrome' + ' browser that just popped up');
                        console.log('\tClose that browser tab to complete your debugging session'.bold);
                        console.log('');
                        console.log('');*/
                        }
                    }), 500);

                    // for debugging the child invocation:
                    child.stderr.on('data', messageBuffer => {
                        const data = messageBuffer.toString();

                        if (data.indexOf('EADDRINUSE') >= 0) {
                            //
                            // oops, we'll need to try another pair of
                            // ports. we'll do son in the on('exit')
                            // handler below
                            //
                            addrInUse = true;
                            kill(child.pid);

                        } else if (isOldNodeJS &&
                                   data.indexOf('ResourceTree') < 0
                                   && data.indexOf('Assertion failed') < 0
                                   && data.indexOf('listening on port') < 0
                                   && data.indexOf('another process already listening') < 0
                                   && data.indexOf('exceptionWithHostPort') < 0
                                   && data.indexOf('use a different port') < 0) {
                            //
                            // ignore some internal errors in node-inspector
                            //
                            console.error('stderr: ' + data);
                        }
                    })
                    /* !child.then */
                } else {
                    // child is a promise
                }

                var onInvocationDone = function() {
                    try {
                        child.__killedByWSKDBInvocationDone = true;
                        if (isOldNodeJS) {
                            kill(child.pid);
                        }
                    } catch (err) {
                        console.error('Error cleaning up after activation completion', err);
                    }
                };
                
                function cleanUpSubprocesses(err, stdout, stderr) {
                    if (addrInUse) {
                        eventBus.removeListener('invocation-done', onInvocationDone);
                        return trySpawnWithBrowser(webPort + 1, debugPort + 1);
                    } else if (err) {
                        console.log('Error launching debugger', err);
                    } else {
                        diff.rememberIfChanged(message.action, tmpFilePath, tmpdirCleanupCallback, removeBootstrapPatch);

                        if (isOldNodeJS) {
                            if (!child.__killedByWSKDBInvocationDone) {
                                // if we were killed by an invocation-done event, then the ok was already issued elsewhere
                                done() //ok_(done);
                            } else {
                                done();
                            }
                        }
                    }
                }
                if (!child.then) {
                    child.on('exit', cleanUpSubprocesses);
                } else {
                    child.then(done)
                        .catch(err => {
                            console.error(err)
                            done()
                        })
                }

                //
                // the activation that we are debugging has
                // finished. kill the child debugger process
                //
                eventBus.on('invocation-done', onInvocationDone);

            } /* end of trySpawnWithBrowser */

            function spawnWithCLI() {
                try {
                    var spawnOpts = {
                        cwd: process.cwd(),
                        stdio: ['inherit', 'inherit', 'pipe'],
                        env: env
                    };
                    var child = spawn('node',
                                      ['debug', tmpFilePath],
                                      spawnOpts);

                    //
                    // the activation that we are debugging has
                    // finished. kill the child debugger process
                    //
                    eventBus.on('invocation-done', () => kill(child.pid));

                    var addrInUse = false;
                    child.stderr.on('data', (message) => {
                        message = message.toString();
                        if (message.indexOf('EADDRINUSE') >= 0) {
                            addrInUse = true;
                            kill(child.pid);
                        }
                    });
                                    
                    //
                    // the child debugger process has terminated, clean things up
                    //
                    child.on('exit', (code) => {
                        if (addrInUse) {
                            console.error('Port 5858 is in use, please clear this up, thanks');
                        }
                        if (code !== 0) {
                            console.error('The NodeJS debugger exited abnormally with code ' + code);
                        }

                        diff.rememberIfChanged(message.action, tmpFilePath, tmpdirCleanupCallback, removeBootstrapPatch);
                        done(); // we don't need to "ok" here, as the invoker will do that for us
                    });
                } catch (e) {
                    console.error('Error spawning debugger', e);
                    console.error(e.stack);
                    done();
                }
            }

                /*if (commandLineOptions['use-cli-debugger']) {
                spawnWithCLI();
            } else*/ {
                trySpawnWithBrowser(8080, 5858);
            }
        });
        } catch (e) {
            console.error(e);
            console.error(e.stack);
            try { tmpdirCleanupCallback(); } catch (e) { }
            done();
        }
    });
};
