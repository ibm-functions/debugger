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
