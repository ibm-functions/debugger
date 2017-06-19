const localStorageKey = 'openwhisk.debugger.attachedTo',
      localStorageKeyForSavedState = 'openwhisk.debugger.state',
      modelKey = action => `${action.namespace}/${action.name}`

/**
 * Persistence of models for the debugger
 *
 */
module.exports = {

    /** forget everything! */
    clear: () => {
        localStorage.removeItem(localStorageKey)
        localStorage.removeItem(localStorageKeyForSavedState)
        return Promise.resolve()
    },

    saveClientState: state => localStorage.setItem(localStorageKeyForSavedState, JSON.stringify(state)),
    getSavedClientState: () => JSON.parse(localStorage.getItem(localStorageKeyForSavedState) || '{}'),
    
    getPreviousAttachments: action => {
        const model = JSON.parse(localStorage.getItem(localStorageKey))
        return model && model[modelKey(action)] || {}
    },

    /**
     * Persist that the debugger has been attached to the given action with the given attachment options
     *
     * @param attachModel is the return value of the debugger client.attach
     *
     */
    remember: (action, attachModel) => {
        const model = JSON.parse(localStorage.getItem(localStorageKey)) || {}
        model[modelKey(action)] = attachModel
        localStorage.setItem(localStorageKey, JSON.stringify(model))
        return attachModel
    }
}
