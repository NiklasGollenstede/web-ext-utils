(function(global) { 'use strict'; define([ 'require', ], (require) => { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

const chrome = (global.browser || global.chrome);
const resolved = Promise.resolve();
const port = chrome.runtime.connect({ name: 'require.scriptLoader', });
port.requests = new Map/*<random, [ resolve, reject, ]>*/;
const rootUrl = chrome.extension.getURL('');
const gecko = rootUrl.startsWith('moz-');
const FunctionConstructor = (() => 0).constructor; // avoid to be flagged by static analysis

function onMessage([ method, id, args, ]) {
	if (method === '') { // handle responses
		const [ value, ] = args;
		const threw = id < 0; threw && (id = -id);
		const request = port.requests.get(id); port.requests.delete(id);
		request[+threw](value);
	} else { // handle requests
		if (!methods[method]) { port.postMessage([ '', -id, [ { message: 'Unknown request', }, ], ]); }
		else if (!id) {
			methods[method].apply(port, args);
		} else {
			resolved.then(() => methods[method].apply(port, args)).then(
				value => port.postMessage([ '', +id, [ value, ], ]),
				error => port.postMessage([ '', -id, [ error instanceof Error ? {
					name: error.name, message: error.message, stack: error.stack,
				} : error, ], ])
			);
		}
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
		return resolved.then(() => new FunctionConstructor(`return (${ script }).apply(this, arguments)`).apply(global, args));
	},
	require(modules) {
		if (!Array.isArray(modules)) {
			require.config({ config: modules, });
			modules = Object.keys(modules);
		}
		if (typeof require.async === 'function') {
			return Promise.all(modules.map(_ => require.async(_))).then(_=>_.length);
		} else {
			return new Promise(done => require(modules, done));
		}
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
const readystates = [ 'interactive', 'complete', ];

function loadScript(url) {
	return request('loadScript', url);
}

const listeners = new Set; let unloaded = false;
function doUnload() {
	if (unloaded) { return; } unloaded = true;
	delete global.require; delete global.define;

	listeners.forEach(listener => { try { listener(); } catch (error) { console.error(error); } });
	listeners.clear();

	port.onDisconnect.removeListener(doUnload);
	port.onMessage.removeListener(onMessage);
	gecko && window.removeEventListener('unload', doUnload);
	gecko && window.removeEventListener(rootUrl +'unload', onDisconnect.probe);
	gecko && window.removeEventListener('focus', onDisconnect.probe);
	port.disconnect();
}

const onDisconnect = Object.freeze({
	addListener(listener) { listeners.add(listener); },
	removeListener(listener) { listeners.delete(listener); },
	/// tests whether the background page that created this content script is still alive, and emits onDisconnect if it is not
	probe() {
		try { post('ping'); return false; }
		catch (_) { resolved.then(doUnload); return true; }
	},
});

port.onDisconnect.addListener(doUnload);
port.onMessage.addListener(onMessage);

if (gecko) {
	// the BF-cache of firefox means that ports are normally not closed when a tab is navigated
	window.addEventListener('unload', doUnload); // TODO: this disables the BF-cache ==> use pagehide instead? and reconnect on pageshow?
	// firefox doesn't fire onDisconnect if a port becomes unusable because the other side is gone, which happens when the extension is reloaded via 'about:debugging' and probably when updating
	window.dispatchEvent(new CustomEvent(rootUrl +'unload')); // so tell a potential previous content to check if its port is still working, and disconnect if it is not
	window.addEventListener(rootUrl +'unload', onDisconnect.probe); // if the page content knows this, it can only ping
	window.addEventListener('focus', onDisconnect.probe); // and to update the view when the extension was disabled, also probe on focus
}


require.config({ defaultLoader: loadScript, });

return { onDisconnect, };

}); })(this);
