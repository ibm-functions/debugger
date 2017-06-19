const minimist = require('minimist')

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
              argv = options._ // this is a minimist thing

        //
        // remove the minimist bits, now that we've captured them in the argv variable
        // (to avoid passing options._ through to the debug session as an invocation parameter)
        //
        delete options._

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
            .then(() => client.invoke(action, options))                // invoke it in the debugger
            .then(response => 'Debug session complete')                // hurray!
            .catch(ui.oops(block, nextBlock))
    }
}
