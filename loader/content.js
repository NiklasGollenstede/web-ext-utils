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

let debug = false, lRequire = null, gRequire = null, loaded; const loading = new Promise(_=>(loaded = _));
const chrome = (global.browser || global.chrome);
const rootUrl = chrome.extension.getURL('');
const gecko = rootUrl.startsWith('moz-');
const options = { }; function setOptions(props) {
	Object.assign(options, props);
	if ('d' in props) { debug = options.d; }
}
if ('__options__' in global) { setOptions(global.__options__); delete global.__options__; }

const session = options.s || ((/\bs=%22([0-9a-v]{11})%22/).exec((new Error).stack) || [ '', '<no_session>', ])[1];

if (global.__content_loadedd__) {
	if (global.__content_loadedd__.session === session) { debug && console.info('skip due to same session', session); return false; }
	debug && console.info('unloading from old session', global.__content_loadedd__.session); global.__content_loadedd__.doUnload();
}
Object.defineProperty(global, '__content_loadedd__', { value: { session, doUnload, }, configurable: true, });

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
		const script = scripts[id]; delete script[id];
		return script(...args);
	},
	setOptions,
};

async function connect(name, { wait = true, } = { }) {
	const Port = (await lRequire.async('../lib/multiport/'));
	if (!(await request('connect', name, { wait, }))) { return null; }
	return new Port({ port, channel: name, }, web_ext_PortMulti);
}

class web_ext_PortMulti {
	constructor({ port, channel, }, onData, onEnd) {
		this.port = port;
		this.onMessage = data => data[0].startsWith(channel) && onData(data[0].slice(channel.length), data[1], JSON.parse(data[2]));
		this.onDisconnect = () => onEnd();
		this.port.onMessage.addListener(this.onMessage);
		this.port.onDisconnect.addListener(this.onDisconnect);
		this.channel = (channel += '$');
	}
	send(name, id, args) {
		args = JSON.stringify(args); // explicitly stringify args to throw any related errors here.
		try { this.port.postMessage([ this.channel + name, id, args, ]); }
		catch (error) { this.onDisconnect(); }
	}
	destroy() {
		this.port.onMessage.removeListener(this.onMessage);
		this.port.onDisconnect.removeListener(this.onDisconnect);
	}
}

function doUnload() {
	if (unloaded) { return; } unloaded = true;
	debug && console.info('unloading content', session);
	delete global.require; delete global.define; delete global.__content_loadedd__;
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
	debug && console.info('content hide');
	window.addEventListener('pageshow', onPageShow, true);
	request('pagehide').then(() => debug && console.info('got reply for pagehide'));
}
function onPageShow({ isTrusted, }) {
	if (!isTrusted) { return; }
	debug && console.info('content show');
	global.reRegisteringLoaderAfterPageShow = true; // TODO: remove this
	request('pageshow').then(() => debug && console.info('got reply for pageshow'))
	.catch(error => console.error(error)).then(() => delete global.reRegisteringLoaderAfterPageShow);
}

function onAfterReload() { onUnload.probe(); debug && console.info('onAfterReload'); }
function onVisibilityChange() { !document.hidden && onUnload.probe(); debug && console.info('onVisibilityChange'); }

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

			define((require, exports, module) => {
				const config = module.config();
				config && setOptions(config);
				debug && console.info('loader', module.id, options);
				require.config({
					map: { '*': { './': module.id, './views': module.id, }, },
					config: config && config.v && { 'node_modules/web-ext-utils/browser/index': { name: config.b, version: config.v, }, },
				});
				lRequire = require;
				gRequire = global.require;
				loaded();
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

return true; })(this); // must be last statement
