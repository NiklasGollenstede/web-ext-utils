'use strict'; define('web-ext-utils/chrome', function() {

const cache = new WeakMap;
let storageShim, messageHandler;

const urlPrefix = chrome.extension.getURL('.').slice(0, -1);

const API = {
	wrapApi: wrap,
	applications: {
		gecko: urlPrefix.startsWith('moz'),
		chromium: urlPrefix.startsWith('chrome'),
	},
	extension: chrome.extension,
	get messages() { return (messageHandler || (messageHandler = new MessageHandler)); },
	get runtime() { return wrap(chrome.runtime); },
	get storage() { return chrome.storage ? wrap(chrome.storage) : (storageShim || (storageShim = new StorageShim)); },
	get tabs() { return wrap(chrome.tabs); },
	get windows() { return wrap(chrome.windows); },
};
Object.keys(API).forEach(key => Object.defineProperty(API, key.replace(/^./, s => s.toUpperCase()), Object.getOwnPropertyDescriptor(API, key)));

function wrap(api) {
	if (!api || (typeof api.addListener === 'function' && typeof api.removeListener === 'function')) { return api; }
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
		} else if (desc.value && typeof desc.value === 'object') {
			desc.value = wrap(desc.value);
		}
		return Object.defineProperty(clone, key, desc);
	});
	return clone;
}

function promisify(method, thisArg) {
	return function() {
		return new Promise((resolve, reject) => {
			method.call(thisArg, ...arguments, function() {
				const error = chrome.runtime.lastError || chrome.extension.lastError;
				return error ? reject(error) : resolve(...arguments);
			});
		});
	};
}

function StorageShim() {
	console.log('chrome.storage is unavailable (in this context), fall back to sending messages to the background script');
	const sendMessage = promisify(chrome.runtime.sendMessage, chrome.runtime);
	const proxy = (area, method) => (query) => sendMessage({ name: 'storage', args: [ area, method, query, ], })
	.then(({ error, value, }) => { console.log('storageShim', error, value); if (error) { throw error; } return value; });
	const listeners = new Set;
	chrome.runtime.onMessage.addListener(message => message && message.name === 'storage.onChanged' && listeners.forEach(listener => {
		// console.log('got change', listener, message);
		try { listener(message.change, message.area); } catch (error) { console.error('error in chrome.storage.onChanged', error); }
	}));
	return {
		local: {
			get: proxy('local', 'get'),
			set: proxy('local', 'set'),
			remove: proxy('local', 'remove'),
			getBytesInUse: proxy('local', 'getBytesInUse'),
			clear: proxy('local', 'clear'),
		},
		sync: {
			get: proxy('sync', 'get'),
			set: proxy('sync', 'set'),
			remove: proxy('sync', 'remove'),
			getBytesInUse: proxy('sync', 'getBytesInUse'),
			clear: proxy('sync', 'clear'),
		},
		onChanged: {
			addListener: listeners.add.bind(listeners),
			removeListener: listeners.delete.bind(listeners),
			hasListener: listeners.has.bind(listeners),
			hasListeners: () => !! listeners.size
		},
	};
}

class MessageHandler {
	constructor() {
		this._handlers = { };
		this._listener = null;
		this._sendMessage = promisify(chrome.runtime.sendMessage, chrome.runtime);
		this.addHandler = this.addHandler.bind(this);
		this.removeHandler = this.removeHandler.bind(this);
		this.request = this.request.bind(this);
		this.isExclusiveMessageHandler = false;
	}
	addHandler(name, handler) {
		if (this._handlers[name]) { throw new Error('Duplicate message handler for "'+ name +'"'); }
		this._handlers[name] = handler;
		this._attach();
		return this;
	}
	removeHandler(name) {
		const ret = delete this._handlers[name];
		this._detatch();
		return ret;
	}
	request(name, ...args) {
		return this._sendMessage({ name, args, }).then(({ error, value, }) => { if (error) { throw fromJson(error); } return value; });
	}
	_attach() {
		if (this._listener) { return; }
		this._listener = ({ name, args, }, sender, reply) => {
			if (!this._handlers[name]) {
				if (!this.isExclusiveMessageHandler) { return; }
				reply({ error: toJson(new Error('Missing message handler for "'+ name +'"')), });
				console.error('Rejected message request for "'+ name +'": no such handler.');
				return;
			}
			try {
				const value = this._handlers[name](...args);
				if (value instanceof Promise) {
					value.then(
						value => reply({ value, }),
						error => reply({ error: toJson(error), })
					);
					return true;
				} else {
					reply({ value, });
				}
			} catch (error) {
				reply({ error: toJson(error), });
			}
		};

		chrome.runtime.onMessage.addListener(this._listener);
	}
	_detatch() {
		if (Object.keys(this.listeners).length || !this._listener) { return; }
		chrome.runtime.onMessage.removeListener(this._listener);
		this._listener = null;
	}
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

return API;

});
