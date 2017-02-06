(function(global) { 'use strict'; define([ 'require', ], (require) => { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

const chrome = (global.browser || global.chrome);
const requests = new Map/*<random, [ resolve, reject, ]>*/;
const port = chrome.runtime.connect({ name: 'require.scriptLoader', });
const gecko = chrome.extension.getURL('').startsWith('moz-');

function loadScript(url) {
	const id = Math.random() * 0x100000000000000;
	port.postMessage([ 'loadScript', id, [ url, ], ]);
	return new Promise((resolve, reject) => requests.set(id, [ resolve, reject, ]));
}
function onMessage([ _, id, [ value, ], ]) {
	const threw = id < 0; threw && (id = -id);
	const request = requests.get(id); requests.delete(id);
	request[+threw](value);
}

const listeners = new Set; let unloaded = false;
const doUnload = () => {
	if (unloaded) { return; } unloaded = true;
	global.require === require && (delete global.require);
	global.define  === define  && (delete global.define);
	port.onDisconnect.removeListener(doUnload);
	port.onMessage.removeListener(onMessage);
	listeners.forEach(listener => { try { listener(); } catch (error) { console.error(error); } });
	listeners.clear();
	Object.keys(require.cache).forEach(key => delete require.cache[key]);
	gecko && global.removeEventListener('unload', doUnload);
	port.disconnect();
};

const onDisconnect = {
	addListener(listener) { listeners.add(listener); },
	removeListener(listener) { listeners.delete(listener); },
	probe() {
		try { port.postMessage([ 'ping', 0, [ ], ]); }
		catch (_) { Promise.resolve().then(doUnload); return true; }
		return false;
	},
};

port.onDisconnect.addListener(doUnload);
port.onMessage.addListener(onMessage);
gecko && global.addEventListener('unload', doUnload); // TODO: this disables the BF-cache ==> use pagehide instead? and reconnect on pageshow?

require.config({ defaultLoader: loadScript, });

return { _private_port_: port, onDisconnect, };

}); })(this);
