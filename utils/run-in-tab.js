(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../browser/': { Tabs, rootUrl, },
	require,
}) => {

/**
 * Dynamically executes content scripts.
 * @param  {natural}       tabId    The id of the tab to run in.
 * @param  {natural}       frameId  Optional. The id of the frame within the tab to run in.
 * @param  {...string}     files    Absolute URLs to local script files to load before executing `script`.
 * @param  {function}      script   A function that will be decompiled and run as content script.
 * @param  {...any}        args     JSON-arguments to the function.
 * @return {Promise(any)}           Promise to the value (or the value of the promise) returned by 'script'.
 */
return async function runInTab(tabId, ...args) {
	const files = [ ]; let frameId = 0;
	let i = 0; while (typeof args[i] !== 'function' && i < args.length) {
		if (i === 0 && typeof args[i] === 'number') { frameId = args[i]; continue; }
		if (args[i].startsWith(rootUrl)) { args[i] = args[i].replace(rootUrl, '/'); }
		if (!(/^\//).test(args[i])) { throw new TypeError('URLs must be absolute'); }
		files.push(args[i++]);
	}

	const script = args[i];
	if (!script) { throw new TypeError(`Can't find 'script' parameter`); }
	args.splice(0, i + 1);

	(await Promise.all(
		files.map(file => Tabs.executeScript(tabId, { frameId, file, }))
		.concat(require.async('../../es6lib/port'))
	));

	const { Messages, } = require('../browser/');
	const id = 'runInTab.'+ Math.random().toString(36).slice(2);
	let resolve, reject; const promise = new Promise((y,n) => ((resolve = y), (reject = n)));

	Messages.addHandler(id, ({ threw, value, error, }) => {
		Messages.removeHandler(id);
		if (!threw) { return resolve(value); }
		if (typeof error === 'string' && error.startsWith('$_ERROR_$')) {
			const object = JSON.parse(error.slice(9));
			error = Object.create((object.name ? global[object.name] || Error : Error).prototype);
			Object.assign(error, object);
		}
		return reject(error);
	});

	const [ alsoId, ] = (await Tabs.executeScript(tabId, { frameId, code: `(`+ ((global, id, script, args) => {
		const reply = arg => (global.browser || global.chrome).runtime.sendMessage([ id, 0, [ arg, ], ]);
		Promise.resolve().then(() => script.apply(global, args))
		.then(value => reply({ value, }))
		.catch(error => reply({ threw: true, error: error instanceof Error ? '$_ERROR_$'+ JSON.stringify({
			name: error.name, message: error.message, stack: error.stack,
		}) : error, }));
		return id;
	}) +`)(this, "${ id }", ${ script }, ${ JSON.stringify(args) })\n//# sourceURL=${ require.toUrl('eval') }\n`, }));

	if (alsoId !== id) { throw new Error(`Failed to execute script in tab`); }
	return promise;
};

}); })(this);
