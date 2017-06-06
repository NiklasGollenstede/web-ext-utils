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
		catch (_) { resolved.then(doUnload); return true; }
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

if (global.require) {
	if (global.reRegisteringLoaderAfterPageShow) { return; }
	throw new Error(`Loading content loader in a frame that is already loaded`);
}

let debug = false, require = null, resolveRequire; const getRequire = new Promise(_=>(resolveRequire = _)).then(_=>(require = _));
const chrome = (global.browser || global.chrome);
const resolved = Promise.resolve();
const readystates = [ 'interactive', 'complete', ]; // document.readystate values, ascending
const rootUrl = chrome.extension.getURL('');
const gecko = rootUrl.startsWith('moz-');
const _fetch = global.__original_fetch__ = global.__original_fetch__ || global.fetch;
const objectUrls = Object.create(null), scripts = Object.create(null);

const port = chrome.runtime.connect({ name: 'require.scriptLoader', });
      port.requests = new Map/*<random, [ resolve, reject, ]>*/;
const unloadListeners = new Set; let unloaded = false;

async function onMessage([ method, id, args, ]) {
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
		if (!require) { (await getRequire); }
		if (!Array.isArray(modules)) {
			require.config({ config: modules, });
			modules = Object.keys(modules);
		}
		return new Promise((done, failed) => require(modules, (...args) => done(args.length), failed));
	},
	callScript(id, args) {
		const script = scripts[id]; delete script[id];
		return script(...args);
	},
	waitFor(state) { return new Promise(ready => {
		if (readystates.indexOf(document.readystate) <= readystates.indexOf(state)) { return void ready(); }
		document.addEventListener('readystatechange', function check() {
			if (document.readystate !== state) { return; }
			document.removeEventListener('readystatechange', check);
			ready();
		});
	}); },
	shimRequire() {
		resolveRequire((modules, done, failed) => Promise.all(modules.map(id => request('loadScript', rootUrl + id +'js'))).then(arg => done(arg.length), failed));
	},
	debug(v) { debug = v; },
};

function doUnload() {
	if (unloaded) { return; } unloaded = true;
	debug && console.debug('unloading content');
	delete global.require; delete global.define;
	global.fetch = _fetch;
	Object.keys(methods).forEach(key => delete methods[key]);

	unloadListeners.forEach(listener => { try { listener(); } catch (error) { console.error(error); } });
	unloadListeners.clear();

	port.onDisconnect.removeListener(doUnload);
	port.onMessage.removeListener(onMessage);
	window.removeEventListener('pagehide', onPageHide, true);
	window.removeEventListener('pageshow', onPageShow, true);
	gecko && window.removeEventListener(rootUrl +'unload', onAfterReload, true);
	gecko && window.removeEventListener('visibilitychange', onVisibilityChange, true);
	port.disconnect();
}

function onPageHide({ isTrusted, }) {
	if (!isTrusted) { return; }
	debug && console.debug('content hide');
	window.addEventListener('pageshow', onPageShow, true);
	request('pagehide').then(() => debug && console.debug('got reply for pagehide'));
}
function onPageShow({ isTrusted, }) {
	if (!isTrusted) { return; }
	debug && console.debug('content show');
	global.reRegisteringLoaderAfterPageShow = true;
	request('pageshow').then(() => debug && console.debug('got reply for pageshow'))
	.catch(error => console.error(error)).then(() => delete global.reRegisteringLoaderAfterPageShow);
}

function onAfterReload() { onUnload.probe(); debug && console.debug('onAfterReload'); }
function onVisibilityChange() { !document.hidden && onUnload.probe(); debug && console.debug('onVisibilityChange'); }

{
	port.onDisconnect.addListener(doUnload);
	port.onMessage.addListener(onMessage);

	window.addEventListener('pagehide', onPageHide, true);

	if (gecko) {
		// firefox doesn't fire onDisconnect if a port becomes unusable because the other side is gone, which happens when the extension is reloaded via 'about:debugging' and probably when updating
		window.dispatchEvent(new CustomEvent(rootUrl +'unload')); // so tell a potential previous content to check if its port is still working, and disconnect if it is not
		window.addEventListener(rootUrl +'unload', onAfterReload, true); // if the page content knows this, it can only ping
		window.addEventListener('visibilitychange', onVisibilityChange, true); // and to update the view when the extension was disabled, also probe when the window becomes visible again
	}

	global.require = {
		async defaultLoader(url) {
			return request('loadScript', url);
		},
		callback() {
			define(({
				require,
				module,
			}) => {
				let info; const config = module.config(); config && ({ debug, info, } = config);
				debug && console.debug('loader', module.id, info);
				require.config({
					map: { '*': { './': module.id, './views': module.id, }, },
					config: info && { 'node_modules/web-ext-utils/browser/index': info, },
				});
				resolveRequire(global.require);
				return ({
					onUnload, getUrl, setScript,
					get debug() { return debug; },
				});
			});
		},
	};

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
