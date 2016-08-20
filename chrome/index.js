define('web-ext-utils/chrome', function() { 'use strict';

const _chrome = (() => { try { return window.top.chrome; } catch (e) { try { return window.parent.chrome; } catch (e) { } } })() || chrome; // for Firefox

const cache = new WeakMap;
let messageHandler;

const ua = navigator.userAgent;
const rootUrl = _chrome.extension.getURL('.').slice(0, -1);
const webkit = rootUrl.startsWith('chrome');
const opera = webkit && (/ OPR\/\d+\./).test(ua);
const vivaldi = webkit && (/ Vivaldi\/\d+\./).test(ua);
const chromium = webkit && !opera && !vivaldi;

const gecko = rootUrl.startsWith('moz');
const fennec = gecko && !(chrome.browserAction && chrome.browserAction.setPopup); // can't use userAgent (may be faked) // TODO: test
const firefox = gecko && !fennec;

/**
 * This is a flat copy of the window.chrome API with the additional properties:
 *
 *     <any chrome API starting with a capital letter>: A deep clone of the original chrome API
 *                          with the difference that all methods of these objects are wrapped such that they automatically
 *                          add a callback as the last parameter and return a promise instead.
 *                          Calling these wrapped functions with a callback parameter will not work,
 *                          because it would result in an invalid signature:
 *                          ``Chrome.Runtime.getManifest()`` will not work as expected, but ``Chrome.runtime.getManifest()`` still does.
 *                          The methods of objects starting with /^on[A-Z]/ (event listeners) are not wrapped,
 *                          so ``Chrome.Storage.onUpdate.addListener(function)`` still works.
 *
 *     Storage:             As described above, only that .Storage.sync === .Storage.local if chrome.storage.sync doesn't exist.
 *     <any chrome API>:    The original chrome API.
 *
 *     messages/Messages:   A MessageHandler instance for more convenient message sending and receiving, @see MessageHandler.
 *
 *     applications:        An object of booleans indicating the browser this WebExtension is running in
 *                          Accessing any other property than those listed above will throw:
 *                              gecko:          Any Mozilla browser.
 *                              firefox:        Firefox desktop.
 *                              fennec:         Firefox for Android. This is not extracted from the userAgent.
 *                              webkit/webKit:  Any webKit/chromium based browser.
 *                              chromium:       WebKit, but Neither opera nor Vivaldi.
 *                              opera:          Opera desktop (webKit).
 *                              vivaldi:        Vivaldi (webKit).
 *                              trident:        false
 *                              edge:           false
 *
 *     rootUrl/rootURL:     The extensions file root URL, ends with '/'.
 *     chrome:              window.chrome, bug-fixed (see below)
 *
 * Furthermore this Chrome object (compared to window.chrome) fixes the Firefox bug that window.parent.chrome has more properties than window.chrome (in an iframe).
 */
const Chrome = new Proxy(Object.freeze({
	chrome: _chrome,
	rootUrl, rootURL: rootUrl,
	get messages() { return new MessageHandler; },
	get Messages() { return new MessageHandler; },
	applications: new Proxy(Object.freeze({
		gecko, firefox, fennec,
		webkit, webKit: webkit, chromium, opera, vivaldi,
		trident: false, edge: false,
	}), { get(self, key) {
		if (self.hasOwnProperty(key)) { return self[key]; }
		throw new Error(`Unknown application "${ key }"`);
	}, set() { }, }),
}), { get(self, key) {
	let value;
	value = self[key]; if (value) { return value; }
	value = _chrome[key]; if (value) { return value; }
	value = _chrome[key.replace(/^./, s => s.toLowerCase())]; if (value) { return wrap(value); }
}, set() { }, });

let mh_handlers = { };
let mh_listener = null;
let mh_sendMessage = promisify(_chrome.runtime.sendMessage, _chrome.runtime);
let mh_sendMessageTab = _chrome.tabs ? promisify(_chrome.tabs.sendMessage, _chrome.tabs) : () => { throw new Error(`Can't send messages to tabs (from within a tab)`); };
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
		add.forEach(([ name, handler, ]) => mh_handlers[name] = handler);
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
function wrap(api) {
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
		const desc = Object.getOwnPropertyDescriptor(api, key);
		if (typeof desc.value === 'function') {
			desc.value = promisify(desc.value, api);
		} else if (typeof desc.value === 'object' && !(/^on[A-Z]/).test(key)) {
			desc.value = wrap(desc.value);
		}
		return Object.defineProperty(clone, key, desc);
	});
	if (api === _chrome.storage && !api.sync) {
		console.info('chrome.storage.sync is unavailable, fall back to chrome.storage.local');
		clone.sync = clone.local;
	}
	return Object.freeze(clone);
}

function promisify(method, thisArg) {
	return function() {
		return new Promise((resolve, reject) => {
			method.call(thisArg, ...arguments, function() {
				const error = _chrome.runtime.lastError || _chrome.extension.lastError;
				return error ? reject(error) : resolve(...arguments);
			});
		});
	};
}

mh_request = makeSendFunction(
	promisify(_chrome.runtime.sendMessage, _chrome.runtime),
	_chrome.tabs ? promisify(_chrome.tabs.sendMessage, _chrome.tabs) : () => { throw new Error(`Can't send messages to tabs (from within a tab)`); },
	false
);
mh_post = makeSendFunction(
	_chrome.runtime.sendMessage,
	_chrome.tabs ? _chrome.tabs.sendMessage : () => { throw new Error(`Can't send messages to tabs (from within a tab)`); },
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

	_chrome.runtime.onMessage.addListener(mh_listener);
}

function mh_detatch() {
	if (!mh_listener || Object.keys(mh_handlers).length) { return; }
	_chrome.runtime.onMessage.removeListener(mh_listener);
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
		const constructor = object.name ? window[object.name] || Error : Error;
		return Object.assign(new constructor, object);
	});
}

return (Chrome);

});
