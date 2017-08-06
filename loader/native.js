(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/': { runtime, },
	'node_modules/web-ext-utils/lib/multiport/': Port,
}) => {

/**
 * Executes a node.js script in the currently experimental Native Ext (https://github.com/NiklasGollenstede/native-ext) application.
 * @param  {string}  options.script     The source of an async function (port => done) that will be executed in a node.js environment.
 * @param  {string}  options.sourceURL  The original source of the `.script` for better error reporting.
 * @return {Port}                       The multiport/Port whose other end was passed to the `.script`.
 */
return async function connect({ script, sourceURL, version = '0.0.1', }) {

	const port = new Port(runtime.connectNative('native_ext_v'+ version), Port.web_ext_Port);

	(await port.request('init', { script, sourceURL, }));

	return port;
};

}); })(this);
