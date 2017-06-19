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
