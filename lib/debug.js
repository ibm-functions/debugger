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

const minimist = require('minimist')

const toMap = A => A.reduce((M, kv) => {
    M[kv.key] = kv.value
    return M
}, {})

/**
 * Invoke a given action in the debugger
 *
 */
module.exports = (wsk, client, attach) => {
    return (block, nextBlock, fullArgv, modules) => {
        const argvWithOptions = fullArgv.slice(fullArgv.indexOf('debug') + 1),
              pair = wsk.parseOptions(argvWithOptions, 'action'),
              regularOptions = minimist(pair.argv),
              options = Object.assign({}, regularOptions, pair.kvOptions),
              parameters = toMap(options && options.action && options.action.parameters || []),
              argv = options._ // this is a minimist thing

        //
        // determine the action name
        //
        let action = argv[0]
        if (!action) {
            const sidecar = document.querySelector('#sidecar')
            if (sidecar && sidecar.entity && sidecar.entity.type === 'actions') {
                action = `/${sidecar.entity.namespace}/${sidecar.entity.name}`
            } else {
                return ui.oops(block, nextBlock)({ error: 'Please select an action' })
            }
        }

        //
        // now we're ready to begin the debug session
        //
        return attach(block, nextBlock, ['attach', action], modules)   // make sure we're attached to the action
            .then(() => client.invoke(action, parameters))             // invoke it in the debugger
            .then(response => repl.qfexec(`wsk activation get ${response.activationId}`))
            .catch(ui.oops(block, nextBlock))
    }
}
