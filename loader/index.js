(function(global) { 'use strict'; const { currentScript, } = document; define([ 'require', ], (require) => { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
/* eslint-disable no-throw-literal */ /* eslint-disable prefer-promise-reject-errors */

/// get config specified in the script tag via < data-...="..." >
const data = currentScript.dataset, config = { };
Object.keys(data).forEach(key => { try { config[key] = JSON.parse(data[key]); } catch(_) {config[key] = data[key]; } });

const chrome = (global.browser || global.chrome);
const resolved = Promise.resolve();
const rootUrl = chrome.extension.getURL('');
const contentPath = require.toUrl('./content.js').replace(rootUrl, '/');
const requirePath = config.requireScript || '/node_modules/es6lib/require.js';
const getScource = (() => {
	const { toString, } = () => 0;
	return func => toString.call(func);
})();
const callChrome = (api, method, ...args) => new Promise((y, n) => api[method](...args, value => n(chrome.runtime.lastError || y(value))));

typeof require.config === 'function' && require.config(config);
if ('serveContentScripts' in config) { serveContentScripts(config.serveContentScripts); }
chrome.webNavigation && chrome.webNavigation.onCommitted.addListener(onNavigation);

const tabs = new Map/*<tabId, Map<frameId, { port, promise, resolve, reject, }>>*/;

function serveContentScripts(value) {
	if (arguments.length === 0) { void 0; } // just return the current state
	else if (value) { chrome.runtime.onConnect.addListener(onConnect); }
	else { chrome.runtime.onConnect.removeListener(onConnect); }
	return chrome.runtime.onConnect.hasListener(onConnect);
}

function onConnect(port) {
	if (port.name !== 'require.scriptLoader') { return; }
	const { tab: { id: tabId, }, frameId, } = port.sender;

	let frames = tabs.get(tabId);     if (!frames) { frames = new Map; tabs.set(tabId, frames); }
	let frame  = frames.get(frameId); if (!frame)  { frame  = { };     frames.set(frameId, frame); }

	if (frame.port) { throw new Error(`CRITICAL: Duplicate frameId ${ frameId } received for tab ${ tabId }`); } // this should never ever happen

	frame.port = port; frame.doDicsonnect = doDicsonnect;
	frame.resolve && frame.resolve(port); frame.resolve = frame.reject = null;

	port.requests = new Map/*<random, [ resolve, reject, ]>*/;
	port.onMessage.addListener(onMessage.bind(null, port));
	port.onDisconnect.addListener(doDicsonnect);
	window.addEventListener('unload', doDicsonnect);

	function doDicsonnect() {
		for (const frame of frameId !== 0 ? [ frame, ] : frames.values()) {
			delete frame.doDicsonnect;
			if (frame.port) { frame.port.disconnect(); frame.port.requests.forEach(_=>_[1](new Error('Tab/frame disconnected'))); }
			if (frame.reject) { frame.reject(port.error || chrome.runtime.lastError); frame.resolve = frame.reject = null; }
		}
		frames.delete(frameId);
		frameId !== 0 && tabs.delete(tabId);
		port.onDisconnect.removeListener(doDicsonnect);
		window.removeEventListener('unload', doDicsonnect);
	}
}

function onMessage(port, [ method, id, args, ]) {
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

async function request(tabId, frameId, method, ...args) { // eslint-disable-line no-unused-vars
	const port = (await getPort(tabId, frameId));
	const id = Math.random() * 0x100000000000000;
	port.postMessage([ method, id, args, ]);
	return new Promise((resolve, reject) => port.requests.set(id, [ resolve, reject, ]));
}

async function post(tabId, frameId, method, ...args) { // eslint-disable-line no-unused-vars
	const port = (await getPort(tabId, frameId));
	port.postMessage([ method, 0, args, ]);
}

const methods = {
	loadScript(url) {
		if (!url.startsWith(rootUrl)) { throw { message: 'Can only load local resources', }; }
		const file = url.slice(rootUrl.length - 1);
		return new Promise((resolve, reject) => chrome.tabs.executeScript(this.sender.tab.id, { file, }, () => {
			if (!chrome.runtime.lastError) { resolve(true); }
			else { reject({ message: chrome.runtime.lastError.message, }); }
		}));
	},
	ping() {
		return true;
	},
};

function getPort(tabId, frameId) {
	let frames = tabs.get(tabId);     if (!frames) { frames = new Map; tabs.set(tabId, frames); }
	let frame  = frames.get(frameId); if (!frame)  { frame  = { };     frames.set(frameId, frame); }
	if (frame.port || frame.promise) { return frame.port || frame.promise; }
	let reject; const promise = frame.promise = new Promise((y, n) => ((frame.resolve = y), (frame.reject = (reject = n))));
	Promise.all([
		callChrome(chrome.tabs, 'executeScript', tabId, { frameId, file: requirePath, }),
		callChrome(chrome.tabs, 'executeScript', tabId, { frameId, file: contentPath, }),
	]).catch(error => { reject(error); frame.promise === promise && (frame.promise = frame.resolve = frame.reject = null); });
	return promise;
}

/**
 * Dynamically executes functions as content scripts.
 * @param  {natural}       tabId    The id of the tab to run in.
 * @param  {natural}       frameId  Optional. The id of the frame within the tab to run in.
 * @param  {function}      script   A function that will be decompiled and run as content script.
 * @param  {...any}        args     Arguments that will be cloned to call the function with.
 *                                  `this` in the function will be the global object (not necessarily `window`).
 * @return {Promise<any>}           Promise to the value (or the value of the promise) returned by 'script'.
 */
async function runInTab(tabId, frameId, script, ...args) {
	if (typeof frameId !== 'number') { args.unshift(script); script = frameId; frameId = 0; }
	if (typeof script !== 'function') { throw new Error(`The script parameter must be a function`); }
	return request(tabId, frameId, 'run', getScource(script), args);
}

/**
 * Dynamically loads content scripts by `require()`ing them in the content context.
 * @param  {natural}          tabId    The id of the tab to run in.
 * @param  {natural}          frameId  Optional. The id of the frame within the tab to run in.
 * @param  {[string]|object}  modules  An Array if module ids to load, or an object where each key is a module id
 *                                     and the values will be made available as `module.config()`.
 * @return {Promise<natural>}          Promise to the number of modules. Rejects if the `require()` call fails.
 */
function requireInTab(tabId, frameId, paths) {
	if (typeof frameId !== 'number') { paths = frameId; frameId = 0; }
	return request(tabId, frameId, 'require', [ paths, ]);
}

const Self = new Map();

class ContentScript {
	constructor(options) {
		const self = { runAt: 'document_end', matches: [ ], }; Self.set(this, self);
		Object.assign(self, options);
		options.matches && (this.matches = options.matches);
	}

	set matches(patterns) {
		!chrome.webNavigation && console.warn(`Using ContentScripts without "webNavigation"!`);
		const self = Self.get(this);
		!Array.isArray(patterns) && (patterns = [ patterns, ]);
		self.matches = patterns.map(pattern => typeof pattern === 'string' ? matchPatternToRegExp(pattern) : pattern);
	} get matches() { return Self.get(this).matches.slice(); }

	set allFrames(v)  { Self.get(this).allFrames = v; }  get allFrames() { return Self.get(this).allFrames; }
	set runAt(v)      { Self.get(this).runAt = v; }      get runAt()     { return Self.get(this).runAt; }
	set modules(v)    { Self.get(this).modules = v; }    get modules()   { return Self.get(this).modules; }
	set script(v)     { Self.get(this).script = v; }     get script()    { return Self.get(this).script; }
	set args(v)       { Self.get(this).args = v; }       get args()      { return Self.get(this).args; }

	async applyNow() {
		const self = Self.get(this);
		const tabs = (await callChrome(chrome.tabs, 'query', { }));
		return [ ].concat(...(await Promise.all(tabs.map(async ({ id: tabId, }) => {
			return Promise.all((await callChrome(chrome.webNavigation, 'getAllFrames', { tabId, })).map(async ({ frameId, url, }) => {
				if (!ContentScript.prototype.matchesTab.call(self, tabId, frameId, url)) { return 0; }
				(await ContentScript.prototype.applyToTab.call(self, tabId, frameId));
				return { tabId, frameId, url, };
			}));
		})))).filter(_=>_);
	}

	async applyToTab(tabId, frameId = 0) {
		if (this.runAt === 'document_idle' || this.runAt === 'document_end') { (await request(tabId, frameId, 'waitFor', {
			document_end: 'interactive', document_idle: 'complete',
		}[this.runAt])); }
		(await getPort(tabId, frameId));
		this.modules && (await requireInTab(tabId, frameId, this.modules));
		this.script && (await runInTab(tabId, frameId, this.script, ...(this.args || [ ])));
	}

	matchesTab(tabId, frameId, url) {
		return (
			(this.allFrames || frameId < 1) // TODO: this should actually check something else
			&& this.matches.some(_=>_.test(url))
		);
	}

	destroy() {
		Self.delete(this);
	}
}

function onNavigation({ tabId, frameId, url, }) {
	const frames = tabs.get(tabId);
	const frame = frames && frames.get(frameId);
	frame && frame.doDicsonnect && frame.doDicsonnect();
	Self.forEach(self => {
		if (!ContentScript.prototype.matchesTab.call(self, tabId, frameId, url)) { return; }
		ContentScript.prototype.applyToTab.call(self, tabId, frameId);
	});
}

// copy from ../utils/index.js
const escape = string => string.replace(/[\-\[\]\{\}\(\)\*\+\?\.\,\\\^\$\|\#]/g, '\\$&');
const matchPattern = (/^(?:(\*|http|https|file|ftp|app):\/\/(\*|(?:\*\.)?[^\/\*]+|)\/(.*))$/i);
function matchPatternToRegExp(pattern) {
	if (pattern === '<all_urls>') { return (/^(?:https?|file|ftp|app):\/\//); } // TODO: this is from mdn, check if chrome behaves the same
	const match = matchPattern.exec(pattern);
	if (!match) { throw new TypeError(`"${ pattern }" is not a valid MatchPattern`); }
	const [ , scheme, host, path, ] = match;
	return new RegExp('^(?:'
		+ (scheme === '*' ? 'https?' : escape(scheme)) +':\/\/'
		+ (host === '*' ? '[^\/]+?' : escape(host).replace(/^\\\*\\./g, '(?:[^\/]+?.)?'))
		+ (path ? '\/'+ escape(path).replace(/\\\*/g, '.*') : '\/?')
	+')$');
}

return {
	serveContentScripts,
	ContentScript,
	runInTab,
	requireInTab,
};

}); })(this);
