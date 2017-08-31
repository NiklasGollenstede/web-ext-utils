(function(global) { 'use strict';  // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * An Event that is fired to tell the background script was disabled/removed/reloaded/killed/updated/... and the content script should unload too.
 * This Event always fires after any of the situations described above,
 * as soon as possible, and at latest when the tab becomes visible or before the extension loads again
 * @method  probe  Can be called by to test whether the content script should unload.
 *                 Returns true if the background script is not reachable, i.e. has unloaded.
 *                 This is mostly the case in Firefox, for example after the extension was disabled.
 *                 Asynchronously fires the Event if it returns true.
 */
const onUnload = Object.freeze({
	addListener(listener) { unloadListeners.add(listener); },
	hasListener(listener) { return unloadListeners.has(listener); },
	removeListener(listener) { unloadListeners.delete(listener); },
	probe() {
		try { post('ping'); return false; }
		catch (_) { Promise.resolve().then(doUnload); return true; }
	},
});

async function getUrl(url) {
	const id = url.slice(rootUrl.length - 1);
	if (objectUrls[id]) { return objectUrls[id]; }
	const blob = (await (await global.fetch((await request('getUrl', url)))).blob());
	return global.URL.createObjectURL(blob);
}

//////// start of private implementation ////////
/* global window, document, CustomEvent, */

let debug = false, require = null, gRequire = null, loaded; const loading = new Promise(_=>(loaded = _));
const chrome = (global.browser || global.chrome);
const rootUrl = chrome.extension.getURL('');
const gecko = rootUrl.startsWith('moz-');
const options = { }; function setOptions(props) {
	Object.assign(options, props);
	if ('d' in props) { debug = options.d; }
}
if ('__options__' in global) {
	setOptions(global.__options__); delete global.__options__;
} else {
	const stack = (new Error).stack;
	(/\bd=(?:true|1)\b/).test(stack) && (debug = true);
}

if (global.__content_loadedd__) {
	console.error('unloading orphaned content script', global.__content_loadedd__.session); // should never happen
	global.__content_loadedd__.doUnload();
}
Object.defineProperty(global, '__content_loadedd__', { value: { doUnload, }, configurable: true, });

const _fetch = global.__original_fetch__ = global.__original_fetch__ || global.fetch;
const objectUrls = Object.create(null), scripts = Object.create(null);

const port = chrome.runtime.connect({ name: 'require.scriptLoader', });
      port.requests = new Map/*<random, [ resolve, reject, ]>*/;
const unloadListeners = new Set; let unloaded = false;

async function onMessage([ method, id, args, ]) {
	if (method.includes('$')) { return; } // for multiplexed Port
	if (method === '') { // handle responses
		const [ value, ] = args;
		const threw = id < 0; threw && (id = -id);
		const request = port.requests.get(id); port.requests.delete(id);
		request[+threw](value);
	} else { // handle requests
		if (!methods[method]) { port.postMessage([ '', -id, [ { message: 'Unknown request', }, ], ]); }
		else if (!id) {
			methods[method].apply(port, args);
		} else { try {
			const value = (await methods[method].apply(port, args));
			port.postMessage([ '', +id, [ value, ], ]);
		} catch (error) {
			error instanceof Error && (error = { name: error.name, message: error.message, stack: error.stack, });
			port.postMessage([ '', -id, [ error, ], ]);
		} }
	}
}

function request(method, ...args) { // eslint-disable-line no-unused-vars
	const id = Math.random() * 0x100000000000000;
	port.postMessage([ method, id, args, ]);
	return new Promise((resolve, reject) => port.requests.set(id, [ resolve, reject, ]));
}

function post(method, ...args) { // eslint-disable-line no-unused-vars
	port.postMessage([ method, 0, args, ]);
}

function setScript(id, script) {
	scripts[id] = script;
}

const methods = {
	async require(modules) {
		if (!gRequire) { (await loading); }
		if (!Array.isArray(modules)) {
			gRequire.config({ config: modules, });
			modules = Object.keys(modules);
		}
		return new Promise((done, failed) => gRequire(modules, (...args) => done(args.length), failed));
	},
	callScript(id, args) {
		const script = scripts[id]; delete scripts[id];
		return script(...args);
	},
	setOptions,
};

async function connect(name, { wait = true, } = { }) {
	const [ Port, web_ext_PortMulti, ] = (await Promise.all([ require.async('../lib/multiport/'), require.async('./multiplex'), ]));
	if (!(await request('connect', name, { wait, }))) { return null; }
	return new Port({ port, channel: name, }, web_ext_PortMulti);
}

function doUnload() {
	if (unloaded) { return; } unloaded = true;
	debug && console.info('unloading content');
	delete global.require; delete global.define; delete global.__content_loadedd__;
	global.fetch = _fetch;
	Object.keys(methods).forEach(key => delete methods[key]);

	unloadListeners.forEach(async listener => { try { const p = listener(); (await p); } catch (error) { console.error(error); } });
	unloadListeners.clear();

	port.onDisconnect.removeListener(doUnload);
	port.onMessage.removeListener(onMessage);
	window.removeEventListener('pagehide', onPageHide, true);
	gecko && window.removeEventListener(rootUrl +'unload', onAfterReload, true);
	gecko && window.removeEventListener('visibilitychange', onVisibilityChange, true);
	port.disconnect();
}

function onPageHide({ isTrusted, }) {
	if (!isTrusted) { return; }
	debug && console.info('content hide');
	doUnload(); // might want to fire onUnload only after the next pageshow, skipping unnecessary unloads to improve performance
}

function onAfterReload() { onUnload.probe(); debug && console.info('onAfterReload'); }
function onVisibilityChange() { !document.hidden && onUnload.probe(); debug && console.info('onVisibilityChange'); }

{
	port.onDisconnect.addListener(doUnload);
	port.onMessage.addListener(onMessage);

	if (gecko) { // should be ok to skip this in browsers without BF-cache
		window.addEventListener('pagehide', onPageHide, true);
	}

	if (gecko) {
		// NOTE: this block doesn't work anymore (probably because the sndboxes are now nuked at the extension unload, removing all event listeners and timeouts). There is NO way not remove DOM elements
		// firefox doesn't fire onDisconnect if a port becomes unusable because the other side is gone, which happens when the extension is reloaded via 'about:debugging' and probably when updating
		window.dispatchEvent(new CustomEvent(rootUrl +'unload')); // so tell a potential previous content to check if its port is still working, and disconnect if it is not
		window.addEventListener(rootUrl +'unload', onAfterReload, true); // if the page content knows this, it can only ping
		window.addEventListener('visibilitychange', onVisibilityChange, true); // and to update the view when the extension was disabled, also probe when the window becomes visible again
	}

	let hiddenBaseUrl = null;

	const config = {
		baseUrl: rootUrl,
		async defaultLoader(url) {
			return request('loadScript', url);
		},
		callingScriptResolver(offset) {
			const stack = (new Error).stack.split(/$/m);
			const line = stack[(/^Error/).test(stack[0]) + 1 + offset];
			const parts = line.split(/\@(?![^\/]*?\.xpi)|\(|\ /g);
			const url = parts[parts.length - 1].replace(/\:\d+(?:\:\d+)?\)?$/, '');
			if (hiddenBaseUrl !== null && url.startsWith(hiddenBaseUrl)) { return url.replace(hiddenBaseUrl, rootUrl); }
			return url;
		},
		callback() {
			const url = config.callingScriptResolver(0);
			if (!url.startsWith(rootUrl)) { hiddenBaseUrl = new global.URL('../../../', url).href; }

			define((_require, exports, module) => {
				const config = module.config();
				config && setOptions(config);
				debug && console.info('loader', module.id, options);
				require = _require; require.config({
					map: { '*': { './': module.id, './views': module.id, }, },
					config: config && config.v && { 'node_modules/web-ext-utils/browser/index': { name: config.b, version: config.v, }, },
				});
				gRequire = global.require; loaded();
				return ({
					onUnload, getUrl, setScript, connect,
					get debug() { return debug; },
				});
			});
		},
	};

	if (typeof global.require === 'function') {
		global.require.config(config);
	} else {
		global.require = config;
	}

	global.fetch = new Proxy(_fetch, {
		async apply(target, self, [ url, arg, ]) {
			if (typeof url === 'string' && url.startsWith(rootUrl)) { url = (await request('getUrl', url)); }
			try { return (await _fetch(url, arg)); }
			catch (error) {
				if (url.startsWith('data:')) { throw error; }
				post('useDataUrls');
				return global.fetch(...arguments[2]);
			}
		},
	});
}

})(this);
