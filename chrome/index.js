(function() { 'use strict'; define(function({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	exports,
}) {

const _chrome = typeof chrome !== 'undefined' && chrome; // getTopGlobal('chrome');
const _browser = typeof browser !== 'undefined' && browser; // getTopGlobal('browser');
const _api = _browser || _chrome;

const cache = new WeakMap;
let messageHandler;

const ua = navigator.userAgent;
const rootUrl = _api.extension.getURL('.').slice(0, -1);
const blink = rootUrl.startsWith('chrome');
const opera = blink && (/ OPR\/\d+\./).test(ua); // TODO: is this safe to do?
const vivaldi = blink && (/ Vivaldi\/\d+\./).test(ua); // TODO: is this safe to do?
const google = blink && !opera && !vivaldi; // TODO: thst for Google Chrome specific api
const chromium = blink && !opera && !vivaldi && !google;

const gecko = rootUrl.startsWith('moz');
const fennec = gecko && !(_api.browserAction && _api.browserAction.setPopup); // can't use userAgent (may be faked) // TODO: test
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
	case (fennec): switch (false) {
		case !(_api.pageAction && _api.pageAction.show): return '50.0';
		default: return '48.0';
	} break;
	case (firefox): switch (false) {
		case !(_api.runtime.connectNative || _api.history && _api.history.getVisits): return '50.0'; // these require permissions
		case !(_api.tabs.removeCSS): return '49.0';
		case !(_api.commands.getAll): return '48.0';
		case !(_api.tabs.insertCSS): return '47.0';
		case !(_api.tabs.move): return '46.0';
		default: return '45.0';
	}
	return '0';
} })();

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
 *     messages/Messages:   A MessageHandler instance for more convenient message sending and receiving, @see MessageHandler.
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
 *     chrome:              Non Promise-capable chrome/browser API, bug-fixed (see below)
 *     browser:             Native Promise-capable chrome/browser API, or null, bug-fixed (see below)
 *
 * Furthermore this Chrome object (compared to window.chrome) fixes the Firefox bug that window.parent.chrome has more properties than window.chrome (in an iframe).
 */
const Chrome = new Proxy(Object.freeze({
	chrome: edgeHTML ? _browser : _chrome,
	browser: gecko ? _browser : null,
	rootUrl, rootURL: rootUrl,
	get messages() { return new MessageHandler; },
	get Messages() { return new MessageHandler; },
	applications: new Proxy(Object.freeze({
		gecko, firefox, fennec,
		blink, chromium, google, chrome: google, opera, vivaldi,
		edgeHTML, edge,
		current: currentApp, version: appVersion,
	}), { get(self, key) {
		if (self.hasOwnProperty(key)) { return self[key]; }
		throw new Error(`Unknown application "${ key }"`);
	}, set() { }, }),
	Storage: cloneLocal(gecko ? _browser.storage : wrapAPI(_api.storage))
}), { get(self, key) {
	let value;
	value = self[key]; if (value) { return value; }
	value = edgeHTML ? _browser[key] : _chrome[key]; if (value) { return value; }
	key = key.replace(/^./, s => s.toLowerCase());
	value = gecko ? _browser[key] : wrapAPI(_api[key]); if (value) { return value; }
}, set() { }, });

let mh_handlers = { };
let mh_listener = null;
let mh_request, mh_post; // these functions are defined below

/**
 * The MessageHandler singleton wraps chrome.runtime/tabs.sendMessage and chrome.runtime.onMessage with the following benefits:
 *  - Promises: the send function returns promises instead of taking callbacks, all handlers can return Promises to return asynchronously
 *  - Proper error handling: all Error objects thrown by the handlers (also in rejected promises) are encoded properly and will reject the Promise on the sending side
 *  - Simpler API, especially for multiple (named) handlers -> no more switches in a single huge message handler
 */
class MessageHandler {
	/// singleton: calling this will return the existing instance
	constructor() {
		if (messageHandler) { return messageHandler; }
		return (messageHandler = this);
	}
	static get instance() { return new MessageHandler; }
	set isExclusiveMessageHandler(_) { console.trace('MessageHandler.isExclusiveMessageHandler is deprecated'); }

	/**
	 * Adds a named message handler.
	 * @param  {string}    name     Optional. Non-empty name of this handler which can me used
	 *                              by .request() and .post() to call this handler. defaults to `handler`.name.
	 * @param  {function}  handler  The handler function. It will be called with JSON-clones of all additional arguments
	 *                              provided to .request() or .post() and may return a Promise to asynchronously return a value.
	 * @return {MessageHandler}     `this` for chaining.
	 * @throws {Error}              If there is already a handler registered for `name`.
	 */
	addHandler(name, handler) {
		if (arguments.length === 1) { handler = name; name = handler.name; }
		if (!name || typeof name !== 'string') { throw new TypeError(`Handler names must be non-empty strings`); }
		if (typeof handler !== 'function') { throw new TypeError(`Message handlers must be functions`); }
		if (mh_handlers[name]) { throw new Error(`Duplicate message handler for "${ name }"`); }
		mh_handlers[name] = handler;
		mh_attach();
		return messageHandler;
	}
	/**
	 * Adds multiple named message handlers.
	 * @param  {string}        prefix    Optional. Prefix to prepend to all handler names specified in `handlers`. Defaults to ''.
	 * @param  {object|array}  handlers  Ether an array of named functions or an object with methods. Array entries / object properties that are no functions will be ignores.
	 * @return {MessageHandler}          `this` for chaining.
	 * @throws {Error}                   If there is already a handler registered for any `prefix` + handler.name; no handlers have been added.
	 */
	addHandlers(prefix, handlers) {
		if (arguments.length === 1) { handlers = prefix; prefix = ''; }
		if (typeof prefix !== 'string') { throw new TypeError(`Handler name prefixes must be strings (or omitted)`); }
		const add = (Array.isArray(handlers) ? handlers.map(f => [ f.name, f, ]) : Object.keys(handlers).map(k => [ k, handlers[k], ])).filter(([ , f, ]) => typeof f === 'function');
		add.forEach(([ name, handler, ]) => {
			if (name === prefix) { throw new TypeError(`Handler names must be non-empty strings`); }
			if (mh_handlers[name]) { throw new Error(`Duplicate message handler for "${ name }"`); }
		});
		add.forEach(([ name, handler, ]) => mh_handlers[prefix + name] = handler);
		mh_attach();
		return messageHandler;
	}
	/**
	 * Removes a named handler.
	 * @param  {string}  name  The name of the handler to be removed.
	 * @return {bool}          true iff a handler existed and has been removed.
	 */
	removeHandler(name) {
		const ret = delete mh_handlers[name];
		ret && mh_detatch();
		return ret;
	}
	/**
	 * Calls a handler in a different context and returns a Promise to its return value.
	 * @param  {object}  tab   Optional. Object of { tabId, frameId, } to send a message to all frames in a tab
	 *                         or optionally a single frame in the tab if frameId is set.
	 * @param  {string}  name  Name of the remote handler to call.
	 * @param  {...any}  args  Additional arguments whose JSON-clones are passed to the remote handler.
	 * @return {Promise}       Promise that rejects if the request wasn't handled my any context
	 *                         or if the handler threw and otherwise resolves to the handlers return value.
	 */
	request(/* arguments */) {
		return mh_request.apply(null, arguments).then(arg => {
			if (!arg) { throw new Error(`No message handler found for "${ name }"`); }
			if (arg.threw) { throw fromJson(arg.error); }
			return arg.value;
		});
	}
	/**
	 * Calls a handler in a different context without waiting for its return value and without guarantee that a handler has in fact been called.
	 * @param  {object}  tab   Optional. Object of { tabId, frameId, } to send a message to all frames in a tab
	 *                         or optionally a single frame in the tab if frameId is set.
	 * @param  {string}  name  Name of the remote handler to call.
	 * @param  {...any}  args  Additional arguments whose JSON-clones are passed to the remote handler.
	 */
	post(/* arguments */) {
		return mh_post.apply(null, arguments);
	}
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

function cloneLocal(storage) {
	if (storage.sync) { return storage; }
	storage = Object.assign({ }, storage);
	// console.info('chrome.storage.sync is unavailable, fall back to chrome.storage.local');
	storage.sync = storage.local;
	return Object.freeze(storage);
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

mh_request = makeSendFunction(
	gecko ? _browser.runtime.sendMessage : promisify(_api.runtime.sendMessage, _api.runtime),
	_api.tabs
	? gecko ? _browser.tabs.sendMessage : promisify(_api.tabs.sendMessage, _api.tabs)
	: () => { throw new Error(`Can't send messages to tabs (from within a tab)`); },
	false
);
mh_post = makeSendFunction(
	_api.runtime.sendMessage,
	_api.tabs ? _api.tabs.sendMessage : () => { throw new Error(`Can't send messages to tabs (from within a tab)`); },
	true
);
function makeSendFunction(send, sendTab, post) {
	return function() {
		const tab = arguments[0];
		if (typeof tab === 'object') {
			const tabId = tab.tabId;
			const frameId = tab.frameId;
			const [ , name, ...args ] = arguments;
			if (!name || typeof name !== 'string') { throw new TypeError(`Handler names must be non-empty strings`); }
			return sendTab(tabId, { name, args, post, }, frameId ? { frameId, } : { });
		} else {
			const [ name, ...args ] = arguments;
			if (!name || typeof name !== 'string') { throw new TypeError(`Handler names must be non-empty strings`); }
			return send({ name, args, post, });
		}
	};
}

function mh_attach() {
	if (mh_listener) { return; }
	mh_listener = ({ name, args, post, }, sender, reply) => {
		if (!mh_handlers[name]) { return; }
		if (post) { mh_handlers[name].apply(sender, args); return; }
		try {
			const value = mh_handlers[name].apply(sender, args);
			if (value instanceof Promise) {
				Promise.prototype.then.call(value,
					value => reply({ value, }),
					error => reply({ error: toJson(error), threw: true, })
				);
				return true;
			} else {
				reply({ value, });
			}
		} catch (error) { reply({ error: toJson(error), threw: true, }); }
	};

	_api.runtime.onMessage.addListener(mh_listener);
}

function mh_detatch() {
	if (!mh_listener || Object.keys(mh_handlers).length) { return; }
	_api.runtime.onMessage.removeListener(mh_listener);
	mh_listener = null;
}

function toJson(value) {
	return JSON.stringify(value, (key, value) => {
		if (!value || typeof value !== 'object') { return value; }
		if (value instanceof Error) { return '$_ERROR_$'+ JSON.stringify({ name: value.name, message: value.message, stack: value.stack, }); }
		return value;
	});
}
function fromJson(string) {
	if (typeof string !== 'string') { return string; }
	return JSON.parse(string, (key, value) => {
		if (!value || typeof value !== 'string' || !value.startsWith('$_ERROR_$')) { return value; }
		const object = JSON.parse(value.slice(9));
		const Constructor = object.name ? window[object.name] || Error : Error;
		const error = gecko ? Object.create(Constructor.prototype) : new Constructor; // Firefox (49) won't log any properties of actual Error instances to the web pages console
		Object.assign(error, object);
		return error;
	});
}

function getTopGlobal(name) { // for Firefox
	try {
		return window.top[name];
	} catch (e) { try {
		return window.parent[name];
	} catch (e) { } }
	return window[name];
}

return (Chrome);

}); })();
