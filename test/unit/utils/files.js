'use strict';

const Loader = require('../setup').makeLoader();

// ../files.json is a copy from `native-ext`

module.exports = Loader.require.async('node_modules/web-ext-utils/utils/files');
