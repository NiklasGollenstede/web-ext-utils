(function(global) { 'use strict'; const factory = function webExtUtils_chrome(exports) { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

const _chrome = typeof chrome !== 'undefined' && global.chrome;
const _browser = typeof browser !== 'undefined' && global.browser;
const _api = _browser || _chrome;

const cache = new WeakMap;
let messageHandler;

const ua = navigator.userAgent;
const rootUrl = _api.extension.getURL('');
const blink = rootUrl.startsWith('chrome');
const opera = blink && (/ OPR\/\d+\./).test(ua); // TODO: is this safe to do?
const vivaldi = blink && (/ Vivaldi\/\d+\./).test(ua); // TODO: is this safe to do?
const google = blink && !opera && !vivaldi; // TODO: test for Google Chrome specific api
const chromium = blink && !opera && !vivaldi && !google;

const gecko = rootUrl.startsWith('moz');
const fennec = gecko && !(_api.browserAction && _api.browserAction.setPopup); // can't use userAgent (may be faked) // TODO: this may be added in the future
const firefox = gecko && !fennec;

const edgeHTML = rootUrl.startsWith('ms-browser');
const edge = edgeHTML;

const currentApp = (() => { switch (true) {
	case (firefox):         return 'firefox';
	case (fennec):          return 'fennec';
	case (chromium):        return 'chromium';
	case (opera):           return 'opera';
	case (vivaldi):         return 'vivaldi';
	case (google):          return 'chrome';
	case (edge):            return 'edge';
} })();

const appVersion = (() => { switch (true) {
	case (edge):            return           (/Edge\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (vivaldi):         return        (/Vivaldi\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (opera):           return            (/OPR\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (blink):           return (/Chrom(?:e|ium)\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (fennec): switch (true) {
		// TODO: keep up to date
		case !!(_api.sessions && _api.sessions.onChanged): return '53.0'; // TODO:  test
		case !!(_api.runtime.onInstalled): return '52.0'; // TODO: test
		case !!(_api.management && _api.management.getSelf): return '51.0';
		case !!(_api.pageAction && _api.pageAction.show): return '50.0';
		default: return '48.0';
	} break;
	case (firefox): switch (true) {
		// TODO: keep up to date
		case !!(_api.sessions && _api.sessions.onChanged): return '53.0'; // TODO:  test
		case !!(_api.runtime.onInstalled): return '52.0'; // TODO: test
		case !!(_api.management && _api.management.getSelf): return '51.0';
		case !!(_api.runtime.connectNative || _api.history && _api.history.getVisits): return '50.0'; // these require permissions
		case !!(_api.tabs.removeCSS): return '49.0';
		case !!(_api.commands.getAll): return '48.0';
		case !!(_api.tabs.insertCSS): return '47.0';
		case !!(_api.tabs.move): return '46.0';
		default: return '45.0';
	}
	return '0';
} })();


return new Promise((resolve, reject) => { // if storage.sync is unavailable, use storage.local instead
	const storage = gecko ? _browser.storage : wrapAPI(_api.storage);
	if (!storage.sync) {
		cloneStorage();
	} else { try {
		storage.sync.get('some_key')
		.then(() => resolve(storage))
		.catch(cloneStorage) // Throws in Firefox if storage.sync is disabled
		.catch(reject);
	} catch (_) { } }
	function cloneStorage() {
		const clone = Object.assign({ }, storage);
		// console.info('chrome.storage.sync is unavailable, fall back to chrome.storage.local');
		clone.sync = storage.local;
		resolve(Object.freeze(clone));
	}
}).then(Storage => {

/**
 * This is a flat copy of the window.chrome / window.browser API with the additional properties:
 *
 *     <any browser/chrome API starting with a capital letter>:
 *                          If a Promise capable version of the API exists, then that API.
 *                          Otherwise a deep clone of the original chrome/browser API with the difference
 *                          that all methods of these objects are wrapped such that they automatically
 *                          add a callback as the last parameter and return a promise instead.
 *                          Calling these wrapped functions with a callback parameter will not work,
 *                          because it would result in an invalid signature:
 *                          ``Chrome.Runtime.getManifest()`` will not work as expected, but ``Chrome.runtime.getManifest()`` still does.
 *                          The methods of objects starting with /^on[A-Z]/ (event listeners) are not wrapped,
 *                          so ``Chrome.Storage.onUpdate.addListener(function)`` still works.
 *
 *     Storage:             As described above, only that .Storage.sync === .Storage.local if .storage.sync doesn't exist.
 *     <any chrome API>:    The original chrome[API], or browser[API] if `chrome` doesn't exist.
 *
 *     messages/Messages:   An es6lib/Port that wrapps the runtime/tabs.on/sendMessage API for more convenient message sending and receiving.
 *                          'es6lib/port.js' to be loaded at the time of accessing. @see https://github.com/NiklasGollenstede/es6lib/blob/master/port.js
 *
 *     applications:        An object of booleans indicating the browser this WebExtension is running in
 *                          Accessing any other property than those listed above will throw:
 *                              gecko:          Any Mozilla browser.
 *                              firefox:        Firefox desktop.
 *                              fennec:         Firefox for Android. This is not extracted from the userAgent.
 *                              blink:          Any blink/chromium based browser.
 *                              chromium:       Chromium and not Google Chrome, Opera or Vivaldi.
 *                              opera:          Opera desktop (Chromium).
 *                              vivaldi:        Vivaldi (Chromium).
 *                              google:         Google Chrome (Chromium).
 *                              chrome:         Google Chrome (Chromium) (alias).
 *                              edgeHTML:       MS Edge
 *                              edge:           MS Edge
 *                              current:        String naming the current browser, one of [ 'firefox', 'fennec', 'chromium', 'opera', 'vivaldi', 'chrome', 'edge', ].
 *                              version:        String version of the current browser, as read from the UserAgent string. For gecko browsers it is feature-detected.
 *
 *     rootUrl/rootURL:     The extensions file root URL, ends with '/'.
 *     chrome:              Non Promise-capable chrome/browser API.
 *     browser:             Native Promise-capable chrome/browser API, or null.
 */
const Chrome = new Proxy(Object.freeze({
	chrome: edgeHTML ? _browser : _chrome,
	browser: gecko ? _browser : null,
	rootUrl, rootURL: rootUrl,
	get messages() { return getGlobalPort(); },
	get Messages() { return getGlobalPort(); },
	applications: new Proxy(Object.freeze({
		gecko, firefox, fennec,
		blink, chromium, google, chrome: google, opera, vivaldi,
		edgeHTML, edge,
		current: currentApp, version: appVersion,
	}), { get(self, key) {
		if (self.hasOwnProperty(key)) { return self[key]; }
		throw new Error(`Unknown application "${ key }"`);
	}, set() { }, }),
	Storage,
}), { get(self, key) {
	let value;
	value = self[key]; if (value) { return value; }
	value = edgeHTML ? _browser[key] : _chrome[key]; if (value) { return value; }
	key = key.replace(/^./, s => s.toLowerCase());
	value = gecko ? _browser[key] : wrapAPI(_api[key]); if (value) { return value; }
}, set() { }, });

function getGlobalPort() {
	if (messageHandler) { return messageHandler; }

	const Port = global.es6lib_port || require('node_modules/es6lib/port');

	const port = new Port(
		{ runtime: Chrome.Runtime, tabs: Chrome.Tabs, },
		Port.web_ext_Runtime
	);
	[ 'addHandler', 'addHandlers', 'removeHandler', 'hasHandler', 'request', 'post', 'destroy', ]
	.forEach(key => port[key] = port[key].bind(port));

	return (messageHandler = port);
}

return (Chrome); });

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

}; if (typeof define === 'function' && define.amd) { define([ 'exports', ], factory); } else { const exp = { }, result = factory(exp) || exp; if (typeof exports === 'object' && typeof module === 'object') { module.exports = result; } else { global[factory.name] = result; } } })((function() { /* jshint strict: false */ return this; })());
