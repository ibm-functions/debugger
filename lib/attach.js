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
