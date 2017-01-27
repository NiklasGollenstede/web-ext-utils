(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
}) => {

const _chrome = typeof chrome !== 'undefined' && global.chrome;
const _browser = typeof browser !== 'undefined' && global.browser;
const _api = _browser || _chrome;

const cache = new WeakMap;
let messageHandler;

const rootUrl = _api.extension.getURL('');
const gecko = rootUrl.startsWith('moz');
const edgeHTML = rootUrl.startsWith('ms-browser');

let Storage = gecko ? _browser.storage : wrapAPI(_api.storage);
if (!Storage.sync || (await Storage.sync.get('some_key').then(() => false, () => true))) { // if storage.sync is unavailable or broken, use storage.local instead
	const clone = Object.assign({ }, Storage);
	clone.sync = Storage.local;
	Storage = Object.freeze(clone);
}

/**
 * This is a flat copy of the window.browser / window.chrome API with the additional properties:
 *
 *     <any browser/chrome API starting with a capital letter>:
 *                          If a Promise capable version of the API exists, then that API.
 *                          Otherwise a deep clone of the original chrome/browser API with the difference
 *                          that all methods of these objects are wrapped such that they automatically
 *                          add a callback as the last parameter and return a promise instead.
 *                          Calling these wrapped functions with a callback parameter will not work,
 *                          because it would result in an invalid signature:
 *                          ``Browser.Runtime.getManifest()`` will not work as expected, but ``Browser.runtime.getManifest()`` still does.
 *                          The methods of objects starting with /^on[A-Z]/ (event listeners) are not wrapped,
 *                          so ``Browser.Storage.onUpdate.addListener(function)`` still works.
 *
 *     Storage:             As described above, only that .Storage.sync === .Storage.local if .storage.sync doesn't exist or work.
 *     <any chrome API>:    The original chrome[API], or browser[API] if `chrome` doesn't exist.
 *
 *     messages/Messages:   An es6lib/Port that wrapps the runtime/tabs.on/sendMessage API for more convenient message sending and receiving.
 *                          'es6lib/port.js' to be loaded at the time of accessing. @see https://github.com/NiklasGollenstede/es6lib/blob/master/port.js
 *
 *     rootUrl/rootURL:     The extensions file root URL, ends with '/'.
 *     chrome:              Non Promise-capable chrome/browser API.
 *     browser:             Native Promise-capable chrome/browser API, or null.
 */
const Browser = new Proxy(Object.freeze({
	chrome: edgeHTML ? _browser : _chrome,
	browser: gecko ? _browser : null,
	rootUrl, rootURL: rootUrl,
	get messages() { return getGlobalPort(); },
	get Messages() { return getGlobalPort(); },
	get applications() { console.error('Chrome.applications has been moved to browser/version.js'); console.trace(); },
	Storage,
}), { get(self, key) {
	let value;
	value = self[key]; if (value) { return value; }
	value = edgeHTML ? _browser[key] : _chrome[key]; if (value) { return value; }
	key = key.replace(/^./, s => s.toLowerCase());
	return gecko ? _browser[key] : wrapAPI(_api[key]);
}, set() { }, });

return Browser;

function getGlobalPort() {
	if (messageHandler) { return messageHandler; }

	const Port = global.es6lib_port || require('node_modules/es6lib/port');

	const port = new Port(
		{ runtime: Browser.Runtime, tabs: Browser.Tabs, },
		Port.web_ext_Runtime
	);
	[ 'addHandler', 'addHandlers', 'removeHandler', 'hasHandler', 'request', 'post', 'destroy', ]
	.forEach(key => (port[key] = port[key].bind(port)));

	return (messageHandler = port);
}

// Deeply clones an object but replaces all functions with Promise-wrapped functions.
function wrapAPI(api) {
	if (!api) { return api; }
	let clone = cache.get(api);
	if (clone) { return clone; }
	clone = promisifyAll(api);
	cache.set(api, clone);
	return clone;
}
function promisifyAll(api) {
	const clone = { };
	Object.keys(api).forEach(key => {
		let value = api[key];
		if (typeof value === 'function') {
			value = promisify(value, api);
		} else if (typeof value === 'object' && !(/^on[A-Z]/).test(key)) {
			value = wrapAPI(value);
		}
		clone[key] = value;
	});
	return Object.freeze(clone);
}

function promisify(method, thisArg) {
	return function() {
		return new Promise((resolve, reject) => {
			method.call(thisArg, ...arguments, function() {
				const error = _api.runtime.lastError || _api.extension.lastError;
				return error ? reject(error) : resolve(...arguments);
			});
		});
	};
}

}); })(this);
