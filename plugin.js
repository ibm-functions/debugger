const ClientSetup = require('./lib/openwhisk-debugger/client/debugger.js'),
      Persistence = require('./lib/persistence')

const onDebugSessionDone = activation => {
    const notification = new Notification('Debug Session Complete', {
        body: `Your debug session has finished with activation id ${activation.activationId}`
    })
    notification.onclick = repl.pexec(`wsk activation get ${activation.activationId}`)
}

const pleaseWait = () => 'Please wait while the plugin finishes its one-time initialization'

const setupPlaceholderRoutes = (commandTree, wsk) => {
    wsk.synonyms('actions').forEach(syn => {
        /** attach routes */
        commandTree.listen(`/wsk/${syn}/attach`, pleaseWait, { docs: 'Attach the debugger to a given action' })

        /** invoke in debugger routes*/
        commandTree.listen(`/wsk/${syn}/debug`, pleaseWait, { docs: 'Invoke an action in the debugger' })
    })

    /** clear all memory of the debugger, from localStorage and the user's namespace */
    commandTree.listen(`/wsk/debugger/reset`, pleaseWait, { hidden: true })
}

/** here is the module */
module.exports = (commandTree, prequire) => {
    const wsk = prequire('/ui/commands/openwhisk-core')

    // it may take some time to do the first ClientSetup, so install some placeholder routes                                                 
    setupPlaceholderRoutes(commandTree, wsk)

    // install the routes
    ClientSetup(wsk, onDebugSessionDone, Persistence.getSavedClientState()).then(client => {
        const attach = require('./lib/attach')(client),
              debug = require('./lib/debug')(wsk, client, attach)

        wsk.synonyms('actions').forEach(syn => {
            /** attach routes */
            commandTree.listen(`/wsk/${syn}/attach`, attach, { docs: 'Attach the debugger to a given action' })

            /** invoke in debugger routes*/
            commandTree.listen(`/wsk/${syn}/debug`, debug, { docs: 'Invoke an action in the debugger' })
        })

        /** clear all memory of the debugger, from localStorage and the user's namespace */
        const reset = () => Promise.all([Persistence.clear(), client.clean()])
              .then(() => 'Debugger reset successfully')
        commandTree.listen(`/wsk/debugger/reset`, reset, { hidden: true })
    })
}
