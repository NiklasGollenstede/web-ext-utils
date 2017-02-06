(function(global) { 'use strict'; const { currentScript, } = document; define([ 'require', ], (require) => { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

/// get config specified in the script tag via < data-...="..." >
const data = currentScript.dataset, config = { };
Object.keys(data).forEach(key => { try { config[key] = JSON.parse(data[key]); } catch(_) {config[key] = data[key]; } });

const chrome = (global.browser || global.chrome);
const rootUrl = chrome.extension.getURL('');
const contentPath = require.toUrl('./content.js').replace(rootUrl, '/');
const requirePath = config.requireScript || '/node_modules/es6lib/require.js';
const stringify = JSON.stringify.bind(JSON);
const getScource = (() => {
	const { toString, } = () => 0;
	return func => toString.call(func);
})();

if ('serveContentScripts' in config) {
	serveContentScripts(config.serveContentScripts);
}
require.config(config);

const tabs = new Map/*<tabId, Map<frameId, { port, promise, resolve, reject, }>>*/;
const requests = new Map/*<random, [ resolve, reject, ]>*/;

function onConnect(port) {
	if (port.name !== 'require.scriptLoader') { return; }
	const { tab: { id: tabId, }, frameId, } = port.sender;

	let frames = tabs.get(tabId);
	if (!frames) { frames = new Map; tabs.set(tabId, frames); }
	let frame = frames.get(frameId);
	if (!frame) { frame = { }; frames.set(frameId, frame); }

	if (frame && frame.port) {
		const message = `Duplicate frameId ${ frameId } received for tab ${ tabId }`;
		console.error(message);
		frame.port.disconnect();
		if (frame.reject) { frame.reject(new Error(message)); delete frame.reject; }
	}
	frame.port = port;
	frame.resolve && frame.resolve(port); delete frame.reject;

	port.onMessage.addListener(onMessage.bind(null, port));
	port.onDisconnect.addListener(() => {
		for (const frame of frameId !== 0 ? [ frame, ] : frames.values()) {
			if (frame.reject) { frame.reject(port.error || chrome.runtime.lastError); delete frame.reject; }
		}
		frames.delete(frameId);
		frameId !== 0 && tabs.delete(tabId);
	});
}

function onMessage(port, [ method, id, args, ]) {
	switch (method) {
		case '': { const [ value, ] = args; // handle responses
			const threw = id < 0; threw && (id = -id);
			const request = requests.get(id); requests.delete(id);
			request[+threw](value);
		} break;
		case 'loadScript': { const [ url, ] = args;
			if (!url.startsWith(rootUrl)) { reject({ message: 'Can only load local resources', }); break; }
			const file = url.slice(rootUrl.length - 1);
			chrome.tabs.executeScript(port.sender.tab.id, { file, }, () => {
				if (!chrome.runtime.lastError) { resolve(true); }
				else { reject({ message: chrome.runtime.lastError.message, }); }
			});
		} break;
		case 'ping': {
			void 0;
		} break;
		default: reject(id, { message: 'Unknown request', });
	}
	function resolve(value) { port.postMessage([ '', +id, [ value, ], ]); }
	function reject (error) { port.postMessage([ '', -id, [ error, ], ]); }
}

function serveContentScripts(value) {
	if (arguments.length === 0) {
		void 0;
	} else if (value) {
		chrome.runtime.onConnect.addListener(onConnect);
	} else {
		chrome.runtime.onConnect.removeListener(onConnect);
	}
	return chrome.runtime.onConnect.hasListener(onConnect);
}

function getPort(tabId, frameId) {
	let frames = tabs.get(tabId);
	if (!frames) { frames = new Map; tabs.set(tabId, frames); }
	let frame = frames.get(frameId);
	if (!frame) { frame = { }; frames.set(frameId, frame); }
	if (frame.port || frame.promise) { return frame.port || frame.promise; }
	let reject; const promise = frame.promise = new Promise((y, n) => ((frame.resolve = y), (frame.reject = (reject = n))));
	Promise.all([
		chrome.tabs.executeScript(tabId, { frameId, file: requirePath, }),
		chrome.tabs.executeScript(tabId, { frameId, file: contentPath, }),
	]).catch(error => { reject(error); frame.promise === promise && delete frame.promise; });
	return promise;
}

/**
 * Dynamically executes content scripts.
 * @param  {natural}       tabId    The id of the tab to run in.
 * @param  {natural}       frameId  Optional. The id of the frame within the tab to run in.
 * @param  {function}      script   A function that will be decompiled and run as content script.
 * @param  {...any}        args     JSON-arguments to the function.
 * @return {Promise(any)}           Promise to the value (or the value of the promise) returned by 'script'.
 */
async function runInTab(tabId, frameId, script, ...args) {
	if (typeof frameId !== 'number') { args.unshift(script); script = frameId; frameId = 0; }
	if (typeof script !== 'function') { throw new Error(`The script parameter must be a function`); }

	const port = (await getPort(tabId, frameId));
	const id = Math.random() * 0x100000000000000;
	let reject; const promise = new Promise((y, n) => requests.set(id, [ y, (reject = n), ]));
	port.onDisconnect.addListener(() => reject(port.error || chrome.runtime.lastError));

	chrome.tabs.executeScript(tabId, {
		frameId,
		code: `(`+ (inContent) +`)(this,\n\t`
		+ [ stringify(contentPath.slice(1, -3)), stringify(id), getScource(script), stringify(args), ].join(',\n\t')
		+`\n);//# sourceURL=${ require.toUrl('eval').replace(/\s/g, ' ') }\n`,
	}, ([ alsoId, ]) => {
		const error = chrome.runtime.lastError || (alsoId !== id && new Error(`Failed to execute script in tab`));
		if (error) { reject(error); requests.delete(id); }
	});

	return promise;
}

function inContent(global, contentPath, id, script, args) {
	const port = require(contentPath)._private_port_;
	Promise.resolve().then(() => script.apply(global, args))
	.then(resolve, reject);
	return id;

	function resolve(value) { port.postMessage([ '', +id, [ value, ], ]); }
	function reject (error) { port.postMessage([ '', -id, [ error instanceof Error ? {
		name: error.name, message: error.message, stack: error.stack,
	} : error, ], ]); }
}

function loadInTab(tabId, frameId, paths) {
	if (typeof frameId !== 'number') { paths = frameId; frameId = 0; }
	return runInTab(tabId, frameId, paths => Promise.all(require.async(paths)).then(_=>_.length), paths || [ ]);
}

return {
	serveContentScripts,
	runInTab,
	loadInTab,
};

}); })(this);
