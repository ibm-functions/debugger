#!/usr/bin/env node

if (process.versions.node.split(/\./)[0] === 6) {
    process.exit(0)
} else {
    process.exit(1)
}