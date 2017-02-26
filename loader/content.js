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

//////// start of private implementation ////////

const require = global.require;
const chrome = (global.browser || global.chrome);
const resolved = Promise.resolve();
const readystates = [ 'interactive', 'complete', ]; // document.readystate values, ascending
const rootUrl = chrome.extension.getURL('');
const gecko = rootUrl.startsWith('moz-');
const FunctionConstructor = (() => 0).constructor; // avoid to be flagged by static analysis

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

const methods = {
	run(script, args) {
		return new FunctionConstructor(`return (${ script }).apply(this, arguments)`).apply(global, args);
	},
	async require(modules) {
		if (!Array.isArray(modules)) {
			require.config({ config: modules, });
			modules = Object.keys(modules);
		}
		return new Promise((resolve, reject) => require(modules, (...args) => resolve(args.length), reject));
	},
	waitFor(state) { return new Promise(ready => {
		if (readystates.indexOf(document.readystate) <= readystates.indexOf(state)) { return void ready(); }
		document.addEventListener('readystatechange', function check() {
			if (document.readystate !== state) { return; }
			document.removeEventListener('readystatechange', check);
			ready();
		});
	}); },
};

function doUnload(event) {
	if (unloaded) { return; } unloaded = true;
	delete global.require; delete global.define;

	(!event || event.type !== 'unload') // no need to unload if the page is being destroyed anyway
	&& unloadListeners.forEach(listener => { try { listener(); } catch (error) { console.error(error); } });
	unloadListeners.clear();

	port.onDisconnect.removeListener(doUnload);
	port.onMessage.removeListener(onMessage);
	gecko && window.removeEventListener('unload', doUnload);
	gecko && window.removeEventListener(rootUrl +'unload', onUnload.probe);
	gecko && window.removeEventListener('visibilitychange', onVisibilityChange);
	port.disconnect();
}

function onVisibilityChange() { !document.hidden && onUnload.probe(); }

{
	port.onDisconnect.addListener(doUnload);
	port.onMessage.addListener(onMessage);

	if (gecko) {
		// the BF-cache of firefox means that ports are normally not closed when a tab is navigated
		window.addEventListener('unload', doUnload); // TODO: this disables the BF-cache ==> use pagehide instead? and reconnect on pageshow?
		// firefox doesn't fire onDisconnect if a port becomes unusable because the other side is gone, which happens when the extension is reloaded via 'about:debugging' and probably when updating
		window.dispatchEvent(new CustomEvent(rootUrl +'unload')); // so tell a potential previous content to check if its port is still working, and disconnect if it is not
		window.addEventListener(rootUrl +'unload', onUnload.probe); // if the page content knows this, it can only ping
		window.addEventListener('visibilitychange', onVisibilityChange); // and to update the view when the extension was disabled, also probe when the window becomes visible again
	}

	require.config({ async defaultLoader(url) {
		return request('loadScript', url);
	}, });

	define({ onUnload, });
}

})(this);
