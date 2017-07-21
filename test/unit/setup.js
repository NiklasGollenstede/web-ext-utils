'use strict'; // license: MPL-2.0

const chai = require('chai');
chai.should();

global.expect = chai.expect;
global.AssertionError = chai.AssertionError;
global.Assertion = chai.Assertion;
global.assert = chai.assert;

const Path = require('path');

function makeLoader() {
	const browser = () => ({
		extension: {
			getURL: path => 'moz-extension://01234567-89ab-cdef-0123-456789abcdef/'+ Path.resolve(path).replace(/^\//, ''),
		},
		storage: { },
	});

	const Loader = require('pbq').makeInstance({ globals: { browser, }, });

	Loader.require.config({
		baseUrl: __dirname +'/',
		paths: { 'node_modules/web-ext-utils': 'file://'+ Path.resolve(__dirname, '../../'), },
	});

	return Loader;
}

module.exports = {
	makeLoader,
};
