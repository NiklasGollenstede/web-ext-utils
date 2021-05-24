// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

/** @typedef {typeof import('../node_modules/webextension-polyfill-ts/lib/index').browser} BrowserT */

/* globals globalThis, */

/* global browser */ // @ts-ignore `browser` is defined, but not actually a property of `global` in firefox content scripts (?)
const api = /**@type{BrowserT}*/(typeof browser !== 'undefined' ? browser : globalThis.chrome);

const rootUrl = api.extension.getURL('');
const gecko = rootUrl.startsWith('moz-');
const edgeHTML = rootUrl.startsWith('ms-browser-');
const blink = !gecko && !edgeHTML;
const inContent = typeof api.extension.getBackgroundPage !== 'function';
const good = gecko; // whether api returns promises

const schemas = {
	// all async: bookmarks, browsingData, certificateProvider, commands, contextMenus, cookies, debugger, documentScan, fontSettings, gcm, history, instanceID, management, notifications, pageCapture, permissions, sessions, tabCapture, topSites, vpnProvider, webNavigation, webRequest, windows,
	alarms: { async: key => key !== 'create', },
	browserAction: {
		fill: !inContent && { },
		async: key => (/^get[A-Z]|^setIcon$/).test(key),
		children: new Proxy({
			map: ((value, api, key) => (blink || edgeHTML) && typeof value === 'function' && (/^set[A-Z]/).test(key)
			? (...args) => (value.apply(api, args), Promise.resolve())
			: value || ((/^[gs]et[A-Z]/).test(key) ? () => Promise.resolve() : (/^on[A-Z]/).test(key) ? { addListener() { }, hasListener() { }, removeListener() { }, } : value)),
		}, { get(self, /**@type{string}*/key) {
			return (/^(on|[gs]et)[A-Z]/).test(key) && self.map;
		}, }),
	},
	desktopCapture: { async: key => key === 'chooseDesktopMedia', },
	downloads: { async: key => !(/^(?:open|show|showDefaultFolder|drag|setShelfEnabled)$/).test(key), },
	extension: { async: key => (/^isAllowed(?:Incognito|FileScheme)Access$/).test(key), children: {
		getUrl: () => Browser.extension.getURL,
	}, },
	i18n: { async: key => (/^(?:getAcceptLanguages|detectLanguage)$/).test(key), },
	identity: { async: key => key !== 'getRedirectURL', },
	idle: { async: key => key === 'queryState', },
	omnibox: { async: () => false, },
	pageAction: { async: key => (/^get[A-Z]|^setIcon$/).test(key), },
	power: { async: () => false, },
	runtime: {
		async: key => (/^get(?:BackgroundPage|BrowserInfo|PlatformInfo)$|^(?:openOptionsPage|send(?:Native)?Message|setUninstallURL|requestUpdateCheck)$/).test(key),
		children: {
			connect: !gecko && addPortError,
			connectNative: !gecko && addPortError,
			openOptionsPage: !inContent && ((current, api) => !current || !api.windows /* fennec */ ? openOptionsPage : good ? current : promisify(current, api)),
		},
	},
	sidebarAction: { async: key => (/^get[A-Z]|^setIcon$/).test(key), }, // TODO: check
	storage: { children: { local: getStorage, sync: getStorage, managed: getStorage, }, },
	system: { children: { cpu: api => getProxy(api), memory: api => getProxy(api), storage: api => getProxy(api), }, },
	tabs: { async: key => key !== 'connect', children: {
		create: gecko && (() => createTabInNormalWindow),
		connect: !gecko && addPortError,
		// executeScript(value, api, key) { return function() { console.log('executeScript(', ...arguments, ')'); return promisify(value, api)(...arguments); }; },
	}, },
	tts: { async: key => (/^(?:speak|isSpeaking|getVoices)$/).test(key), },
	windows: gecko && { children: { create: create => arg => { delete arg.focused; return create(arg); }, }, },
};

/**
 * This is cross-platform clone/polyfill/bug-fix of the WebExtension `browser.*` API:
 *     - all asynchronous functions are wrapped to return Promises instead of accepting a callback
 *     - some platform inconsistencies and bugs are fixed:
 *         - `runtime.openOptionsPage` is polyfilled
 *         - `runtime.Port#error` is polyfilled
 *         - in firefox, prevent tabs.create from defaulting the windowId to popups and private windows
 *         - ...
 *
 * Furthermore, all browser APIs can also be addressed starting with a capital letter (e.g. `.Storage` instead if `.storage`),
 * and the following properties are added:
 *
 *     rootUrl/rootURL:     The extensions file root URL, ends with '/'.
 *     chrome:              Non Promise-capable native chrome/browser API.
 *     browser:             Native Promise-capable chrome/browser API, or null.
 *     inContent:           Boolean that is true if the current context is a content script.
 *     isGecko:             Boolean that is true if the current browser is gecko based (i.e. Firefox of Fennec).
 *     isEdge:              Boolean that is true if the current browser is Microsoft Edge.
 */
const Browser = /**@type{Omit<BrowserT, 'manifest'>&{
	rootUrl: string, rootURL: string,
	chrome: boolean,
	browser: boolean,
	inContent: boolean,
	isGecko: boolean,
	isEdge: boolean,
	manifest: import('../node_modules/webextension-polyfill-ts/lib/index').Manifest.WebExtensionManifest,
}&{
	BrowserAction: BrowserT['browserAction'],
	Commands: BrowserT['commands'],
	Notifications: BrowserT['notifications'],
	PageAction: BrowserT['pageAction'],
	Runtime: BrowserT['runtime'],
	SidebarAction: BrowserT['sidebarAction'],
	Tabs: BrowserT['tabs'],
	Windows: BrowserT['windows'],
}}*/(/**@type{any}*/(new Proxy({
	__proto__: null,
	chrome: edgeHTML ? /**@type{any}*/(globalThis).browser : globalThis.opr || globalThis.chrome,
	browser: gecko ? /**@type{any}*/(globalThis).browser : null,
	rootUrl, rootURL: rootUrl, inContent, isGecko: gecko, isEdge: edgeHTML,
	sidebarAction: getProxy((globalThis.opr || api).sidebarAction, schemas.sidebarAction),
	[Symbol.toStringTag]: 'Browser',
}, { get(cache, /**@type{string}*/key) {
	if (key in cache) { return cache[key]; }
	const Key = key.replace(/^[a-z]/, s => s.toUpperCase()); key = key.replace(/^[A-Z]/, s => s.toLowerCase());
	if (!api[key]) {
		if (key === 'messages') { throw new Error(`use browser/messages instead`); }
		if (key === 'manifest') { return (cache[key] = (cache[Key] = freeze(api.runtime.getManifest()))); }
		if (key === 'rawManifest') { return (cache[key] = (cache[Key] = globalThis.fetch(rootUrl +'manifest.json').then(_=>_.json()).then(freeze))); }
		// return undefined; // eslint-disable-line consistent-return
	}
	return (cache[key] = (cache[Key] = getProxy(api[key], schemas[key])));
}, set() { throw new TypeError(`Browser is read-only`); }, })));
export default Browser;


function getProxy(api, schema) {
	if (good && (!schema || !schema.children)) { return api; }
	if (typeof api !== 'object' || api === null) { if (schema && schema.fill) { api = schema.fill; } else { return api; } }
	const cache = Object.create(null);

	return new Proxy(api, { get(api, /**@type{string}*/key) {
		if (key in cache) { return cache[key]; }
		const desc = Object.getOwnPropertyDescriptor(api, key);
		const value = desc && desc.value || api[key];
		if (schema && schema.children && schema.children[key]) {
			return (cache[key] = schema.children[key](value, api, key));
		}
		if (!good && typeof value === 'function' && (!schema || schema.async && schema.async(key))) {
			return (cache[key] = promisify(value, api));
		}
		if (!desc) { return (cache[key] = undefined); }
		if ('value' in desc) { return (cache[key] = value); }
		if ('get' in desc) { const get = () => api[key]; Object.defineProperty(cache, key, { get, }); return value; }
		throw new TypeError(`Failed to clone .${ key }`);
	}, set(api, /**@type{string}*/key) { throw new TypeError(`"${ key }" is read-only`); }, });
}

function promisify(method, thisArg) { return function() {
	return new Promise((resolve, reject) => method.call(thisArg, ...arguments, function() {
		const error = api.runtime.lastError; error ? reject(error) : resolve(arguments[0]);
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

function getStorage(api, _storage, _key) {
	return getProxy(api);
}

async function openOptionsPage() {
	const ui = Browser.manifest.options_ui;
	if (!ui || !ui.page) { throw new Error(`Can't open an options page if none is specified!`); }
	const url = api.extension.getURL(ui.page), prefix = (/^[^#]*/).exec(url)[1] +'#';
	for (const view of api.extension.getViews({ type: 'tab', })) {
		if (view && (view.location.href === url || view.location.href.startsWith(prefix))) {
			const tab = (await new Promise(got => (/**@type{any}*/(view).browser || /**@type{any}*/(view).chrome).tabs.getCurrent(got)));
			if (tab) { (await Browser.tabs.update(tab.id, { active: true, })); Browser.windows && (await Browser.windows.update(tab.windowId, { focused: true, })); return tab; }
		}
	}
	return Browser.tabs.create({ url, });
}

async function createTabInNormalWindow(props) {
	if (api.windows && props.windowId == null) {
		const wins = (await api.windows.getAll({ windowTypes: [ 'normal', ], })).filter(_=>_.type === 'normal'/* FF54 ignores the filter*/);
		props.windowId = (wins.find(_=>_.focused && !_.incognito) || wins.find(_=>_.focused) || wins[0]).id;
		props.active !== false && api.windows.update(props.windowId, { focused: true, });
	}
	if (props.openerTabId != null) {
		const opener = (await api.tabs.get(props.openerTabId));
		props.index = opener.index;
	}
	delete props.openerTabId;
	return api.tabs.create(props);
}

function addPortError(connect, self) { return function () {
	const port = connect.apply(self, arguments); let error = null;
	Object.defineProperty(port, 'error', { get() { return error; }, enumerable: true, configurable: true, });
	port.onDisconnect.addListener(() => (error = api.runtime.lastError || null));
	return port;
}; }
