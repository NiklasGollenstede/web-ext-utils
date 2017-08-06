(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'./': { Runtime, Tabs, },
	'../lib/multiport/': Port,
}) => {

/**
 * A multiport/Port that wraps the runtime/tabs.on/sendMessage API for more convenient message sending and receiving.
 * Listens for messages on api.runtime.onMessage and can send messages via api.runtime.sendMessage and api.tabs.sendMessage, if available.
 * The `options` parameter of port.request()/.post() can be an object of { tabId, frameId?, } to send to tabs.
 * The `this` in the handler will be set to the messages `sender` unless it is explicitly bound or passed to `.addHandler()`.
 * This Port is never closed automatically.
 *
 * @see https://github.com/NiklasGollenstede/multiport for the full Port API
**/
const port = new Port({ runtime: Runtime, tabs: Tabs, }, class web_ext_Runtime {

	constructor(api, onData) {
		this.api = api; this.onData = onData;
		this.onMessage = (data, sender, reply) => onData(data[0], data[1], data[2], sender, (...args) => reply(args), true);
		this.sendMessage = api.runtime.sendMessage;
		this.sendMessageTab = api.tabs ? api.tabs.sendMessage : () => { throw new Error(`Can't send messages to tabs (from within a tab)`); };
		this.api.runtime.onMessage.addListener(this.onMessage);
	}

	send(name, id, args, tab) {
		let promise;
		if (tab !== null) {
			const { tabId, frameId, } = tab;
			promise = this.sendMessageTab(tabId, [ name, id, args, ], frameId != null ? { frameId, } : { });
		} else {
			promise = this.sendMessage([ name, id, args, ]);
		}
		if (id === 0) { return; } // is post
		promise.then(value => this.onData('', id, value), error => this.onData('', -id, error));
	}

	destroy() {
		this.api.runtime.onMessage.removeListener(this.onMessage);
		this.api = this.onData = null;
	}
});

Object.getOwnPropertyNames(Port.prototype).forEach(key => typeof port[key] === 'function' && (port[key] = port[key].bind(port)));
return port;

}); })(this);
