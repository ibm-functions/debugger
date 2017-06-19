#!/usr/bin/env bash

./bin/isNodejs6.sh

if [ $? == 0 ]; then
    npm install "git://github.com/kerryspchang/node-inspector.git"
fi
