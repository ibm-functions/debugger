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

const minimist = require('minimist'),
      Persistence = require('./persistence')

/** for cli/repl output: turn the keys of a map into an array */
const keys = M => {
    const A = []
    for (let key in M) {
        A.push(key)
    }
    return A
}

/**
 * Attach to an action
 *
 */
module.exports = client => (block, nextBlock, fullArgv, modules) => {
    const argvWithOptions = fullArgv.slice(fullArgv.indexOf('attach') + 1),
          options = minimist(argvWithOptions, { alias: { 'a': 'all' }, boolean: [ 'all' ] }),
          argv = options._ // this is a minimist thing

    let action = argv[0]
    if (!action) {
        const sidecar = document.querySelector('#sidecar')
        if (sidecar && sidecar.entity && sidecar.entity.type === 'actions') {
            action = `/${sidecar.entity.namespace}/${sidecar.entity.name}`
        } else {
            return ui.oops(block, nextBlock)({ error: 'Please select an action' })
        }
    }

    return new Promise((resolve, reject) => {
        client.attach(options, resolve, reject, action, Persistence.getPreviousAttachments(action, options))

    }).then(attachModel => {
        // now we're attached
        Persistence.remember(action, attachModel.attachedTo)
        Persistence.saveClientState(attachModel.state)
        // the replaces remove the remove default namespace from console output
        return `Attached to ${keys(attachModel.attachedTo).map(entity => entity.replace('_/', '').replace(`${namespace.current()}/`, ''))
                              .join(', ')}`
    })
}
