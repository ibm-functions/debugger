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

var uuid = require('uuid');

/**
 *
 * @return a new unique name for an entity
 */
exports.prefix = '___debug___';

exports.name = function name(extra, suffix) {
    return exports.prefix + (extra ? extra + '-' : '') + uuid.v4() + (suffix ? '-' + suffix : '');
};

exports.isDebugArtifact = function isDebugArtifact(name) {
    return name.indexOf(exports.prefix) === 0;
};
