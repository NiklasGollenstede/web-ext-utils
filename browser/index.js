(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	require,
}) => {

/**
 * This is cross-platform clone/polyfill/bug-fix of the WebExtension `browser.*` API:
 *     - all asynchronous functions are wrapped to return Promises instead of accepting a callback
 *     - some platform inconsistencies and bugs are fixed:
 *         - if storage.sync is missing or doesn't work, it is set to storage.local
 *         - `runtime.openOptionsPage` is polyfilled
 *         - in firefox, prevent tabs.create from defaulting the windowId to popups and private windows
 *         - ...
 *
 * Furthermore, all browser APIs can also be addressed starting with a capital letter (e.g. `.Storage` instead if `.storage`),
 * and the following properties are added:
 *
 *     messages/Messages:   An es6lib/Port that wrapps the runtime/tabs.on/sendMessage API for more convenient message sending and receiving.
 *                          'es6lib/port.js' to be loaded at the time of accessing. @see https://github.com/NiklasGollenstede/es6lib/blob/master/port.js
 *
 *     rootUrl/rootURL:     The extensions file root URL, ends with '/'.
 *     chrome:              Non Promise-capable native chrome/browser API.
 *     browser:             Native Promise-capable chrome/browser API, or null.
 *     inContent:           Boolean that is true if the current context is a content script.
 *     isGecko:             Boolean that is true if the current browser is gecko based (i.e. Firefox of Fennec).
 *     isEdge:              Boolean that is true if the current browser is Microsoft Edge.
 */

const api = global.browser || global.chrome;

const rootUrl = api.extension.getURL('');
const gecko = rootUrl.startsWith('moz-');
const edgeHTML = rootUrl.startsWith('ms-browser-');
const inContent = typeof api.extension.getBackgroundPage !== 'function';
const good = gecko; // whether api returns promises

let sync = api.storage.sync; try {
	(await (good ? sync.get : promisify(sync.get, sync))('some_key'));
} catch (_) { sync = api.storage.local; }

const schemas = {
	// all async: bookmarks, browsingData, certificateProvider, commands, contextMenus, cookies, debugger, documentScan, fontSettings, gcm, history, instanceID, management, notifications, pageCapture, permissions, sessions, tabCapture, topSites, vpnProvider, webNavigation, webRequest, windows,
	alarms: { async: key => key !== 'create', },
	browserAction: { async: key => (/^get[A-Z]|^setIcon$/).test(key), },
	desktopCapture: { async: key => key === 'chooseDesktopMedia', },
	downloads: { async: key => !(/^(?:open|show|showDefaultFolder|drag|setShelfEnabled)$/).test(key), },
	extension: { async: key => (/^isAllowed(?:Incognito|FileScheme)Access$/).test(key), },
	i18n: { async: key => (/^(?:getAcceptLanguages|detectLanguage)$/).test(key), },
	identity: { async: key => key !== 'getRedirectURL', },
	idle: { async: key => key === 'queryState', },
	omnibox: { async: () => false, },
	pageAction: { async: key => (/^get[A-Z]|^setIcon$/).test(key), },
	power: { async: () => false, },
	runtime: {
		async: key => (/^get(?:BackgroundPage|BrowserInfo|PlatformInfo)$|^(?:openOptionsPage|send(?:Native)?Message|setUninstallURL|requestUpdateCheck)$/).test(key),
		children: {
			openOptionsPage: !inContent && ((current, api) => current ? good ? current : promisify(current, api) : openOptionsPage),
		},
	},
	sidebarAction: { async: key => (/^get[A-Z]|^setIcon$/).test(key), }, // TODO: check
	storage: { children: { local: getStorage, sync: getStorage, managed: getStorage, }, },
	system: { children: { cpu: api => getProxy(api), memory: api => getProxy(api), storage: api => getProxy(api), }, },
	tabs: { async: key => key !== 'connect', children: {
		create: gecko && api.windows && (() => createTabInNormalWindow),
	}, },
	tts: { async: key => (/^(?:speak|isSpeaking|getVoices)$/).test(key), },
};

const Browser = new Proxy({
	__proto__: null,
	chrome: edgeHTML ? global.browser : global.opr || global.chrome,
	browser: gecko ? global.browser : null,
	rootUrl, rootURL: rootUrl, inContent, isGecko: gecko, isEdge: edgeHTML,
	sidebarAction: getProxy((global.opr || api).sidebarAction, schemas.sidebarAction),
}, { get(cache, key) {
	if (key in cache) { return cache[key]; }
	const Key = key.replace(/^[a-z]/, s => s.toUpperCase()); key = key.replace(/^[A-Z]/, s => s.toLowerCase());
	if (!api[key]) {
		if (key === 'messages') { return (cache[key] = (cache[Key] = getGlobalPort())); }
		if (key === 'manifest') { return (cache[key] = (cache[Key] = freeze(api.runtime.getManifest()))); }
		return undefined; // eslint-disable-line consistent-return
	}
	return (cache[key] = (cache[Key] = getProxy(api[key], schemas[key])));
}, set() { throw new TypeError(`Browser is read-only`); }, });

return Browser;

function getProxy(api, schema) {
	if (typeof api !== 'object' || api === null || good && (!schema || !schema.children)) { return api; }
	const cache = Object.create(null);

	return new Proxy(api, { get(api, key) {
		if (key in cache) { return cache[key]; }
		const desc = Object.getOwnPropertyDescriptor(api, key);
		if (!desc) { return (cache[key] = undefined); }
		const value = desc.value || api[key];
		if (schema && schema.children && schema.children[key]) {
			return (cache[key] = schema.children[key](value, api, key));
		}
		if (!good && typeof value === 'function' && (!schema || schema.async && schema.async(key))) {
			return (cache[key] = promisify(value, api));
		}
		if ('value' in desc) { return (cache[key] = value); }
		if ('get' in desc) { const get = () => api[key]; Object.defineProperty(cache, key, { get, }); return value; }
		throw new TypeError(`Failed to clone .${ key }`);
	}, set(api, key) { throw new TypeError(`"${ key }" is read-only`); }, });
}

function promisify(method, thisArg) { return function() {
	return new Promise((resolve, reject) => method.call(thisArg, ...arguments, function() {
		const error = api.runtime.lastError; error ? reject(error) : resolve(...arguments);
	}));
}; }

function freeze(object) {
	Object.freeze(object);
	Object.keys(object).forEach(key => {
		const value = object[key];
		value !== null  && typeof value === 'object' && freeze(value);
	});
	return object;
}

function getStorage(api, storage, key) {
	key === 'sync' && (api = sync);
	return getProxy(api);
}

function openOptionsPage() {
	const ui = Browser.manifest.options_ui;
	if (!ui || !ui.page) { throw new Error(`Can't open an options page if none is specified!`); }
	return Browser.Tabs.open(api.runtime.getURL(ui.page)); // TODO: should focus if already open
}

async function createTabInNormalWindow(props) {
	if (props.windowId == null) {
		const wins = (await api.windows.getAll({ windowTypes: [ 'normal', ], })).filter(_=>_.type === 'normal'/* FF54 ignores the filter*/);
		props.windowId = (wins.find(_=>_.focused && !_.incognito) || wins.find(_=>_.focused) || wins[0]).id;
		props.active !== false && api.windows.update(props.windowId, { focused: true, });
	}
	if (props.openerTabId != null) {
		const opener = (await api.tabs.get(props.openerTabId));
		props.index = opener.index; delete props.openerTabId;
	}
	return api.tabs.create(props);
}

function getGlobalPort() {
	const Port = global.es6lib_port || require('node_modules/es6lib/port');
	const port = new Port({ runtime: Browser.Runtime, tabs: Browser.Tabs, }, Port.web_ext_Runtime);
	Object.getOwnPropertyNames(Port.prototype).forEach(key => typeof port[key] === 'function' && (port[key] = port[key].bind(port)));
	return port;
}

}); })(this);
