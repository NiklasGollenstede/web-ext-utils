(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { runtime, },
	'node_modules/web-ext-utils/lib/multiport/': Port,
	Multiplex,
}) => {

const ports = new Set;
let channel = null, setup = null;

/**
 * Executes a node.js script in the currently experimental Native Ext (https://github.com/NiklasGollenstede/native-ext) application.
 * @param  {string}  options.script     The source of an async function (port => done) that will be executed in a node.js environment.
 * @param  {string}  options.sourceURL  The original source of the `.script` for better error reporting.
 * @return {Port}                       The multiport/Port whose other end was passed to the `.script`.
 */
return async function connect({ script, sourceURL, }) {
	if (!channel) {
		channel = runtime.connectNative('de.niklasg.native_ext');
		setup = new Port({ port: channel, channel: '-', }, Multiplex);
		setup.ended.then(() => { setup = channel = null; });
		// global.setup = setup; // TODO: remove
	}

	const id = (await setup.request('init', { script, sourceURL, }));

	const port = new Port({ port: channel, channel: id, }, Multiplex);
	// global.port = port; // TODO: remove
	ports.add(port); port.ended.then(() => {
		ports.delete(port);
		if (ports.size) { return; }
		channel.disconnect();
		setup = channel = null;
	});

	return port;
};

}); })(this);
