(function(global) { 'use strict'; define(() => { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

return class Multiplex {
	constructor({ port, thisArg, channel, }, onData, onEnd) {
		if (!(/^[\w-]+$/).test(channel)) { throw new TypeError(`Channel names must be alphanumeric (plus '-' and '_')`); }
		this.port = port;
		this.onMessage = data => {
			data[0].startsWith(channel) && onData(data[0].slice(channel.length), data[1], JSON.parse(data[2]), thisArg);
			data[0] === '$destroy' && data[2] === channel && onEnd();
		};
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
		try { this.port.postMessage([ '$destroy', 0, this.channel, ]); } catch (_) { }
		this.port.onMessage.removeListener(this.onMessage);
		this.port.onDisconnect.removeListener(this.onDisconnect);
		this.port = this.onMessage = this.onDisconnect = null;
	}
};

}); })(this); // eslint-disable-line no-invalid-this
