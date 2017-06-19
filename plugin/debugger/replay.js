const client = require('./helpers/openwhisk-debugger/client/debugger.js'),
      minimist = require('minimist')

/**
 * Replay an activation in the debugger
 *
 */
const doReplay = (block, nextBlock, fullArgv, modules) => new Promise((resolve, reject) => {
    const argvWithOptions = fullArgv.slice(fullArgv.indexOf('await') + 1),
          options = minimist(argvWithOptions /*, { alias: { 'r': 'remote' } }*/),
          argv = options._ // this is a minimist thing

    let action = argv[0]
    if (!action) {
        const sidecar = document.querySelector('#sidecar')
        if (sidecar && sidecar.entity && sidecar.entity.type === 'activation') {
            const pathAnnotation = sidecar.entity.annotations && sidecar.entity.annotations.find(kv => kv.key === 'path'),
                  entityNameWithPackageAndNamespace = pathAnnotation && pathAnnotation.value
            action = entityNameWithPackageAndNamespace
        } else {
            return ui.oops(block, nextBlock)({ error: 'Please select an activation' })
        }
    }

    resolve('hello')
})

/** here is the module */
module.exports = (commandTree, require) => {
    const wsk = require('/ui/commands/openwhisk-core')

    // install the routes
    wsk.synonyms('activations').forEach(syn => {
        commandTree.listen(`/wsk/${syn}/replay`, doReplay, { docs: 'Replay this activation in the debugger' })
    })
}
