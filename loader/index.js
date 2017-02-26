(function(global) { 'use strict'; const { currentScript, } = document; define([ 'require', ], (require) => { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
/* eslint-disable no-throw-literal */ /* eslint-disable prefer-promise-reject-errors */

/**
 * Enables, disables and gets the status of this module serving content scripts.
 * @param  {bool?}  value  Optional. Bool to set the module to enabled or disabled. Omit to leave as is.
 * @return {bool}          Whether the module is now enabled or not.
 */
function serveContentScripts(value) {
	if (arguments.length === 0) { void 0; } // just return the current state
	else if (value) { chrome.runtime.onConnect.addListener(onConnect); }
	else { chrome.runtime.onConnect.removeListener(onConnect); } // TODO: disconnect all open ports
	return chrome.runtime.onConnect.hasListener(onConnect);
}

/**
 * Dynamically executes functions as content scripts.
 * @param  {natural}       tabId    The id of the tab to run in.
 * @param  {natural}       frameId  Optional. The id of the frame within the tab to run in.
 * @param  {function}      script   A function that will be decompiled and run as content script.
 * @param  {...any}        args     Arguments that will be cloned to call the function with.
 *                                  `this` in the function will be the global object (not necessarily `window`).
 * @return {any}                    The value returned or promised by `script`.
 * @throws {any}                    If `script` throws or otherwise fails to execute.
 */
async function runInTab(tabId, frameId, script, ...args) {
	if (typeof frameId !== 'number') { args.unshift(script); script = frameId; frameId = 0; }
	return request(tabId, frameId, 'run', getScource(script), args);
}

/**
 * Dynamically loads content scripts by `require()`ing them in the content context.
 * @param  {natural}          tabId    The id of the tab to run in.
 * @param  {natural}          frameId  Optional. The id of the frame within the tab to run in.
 * @param  {[string]|object}  modules  An Array if module ids to load, or an object where each key is a module id
 *                                     and the values will be made available as `module.config()`.
 * @return {natural}                   The number of modules loaded.
 * @throws {any}                       If any of the modules throws or otherwise fails to load.
 */
async function requireInTab(tabId, frameId, modules) {
	if (typeof frameId !== 'number') { modules = frameId; frameId = 0; }
	return request(tabId, frameId, 'require', modules);
}

/**
 * Defines a content script that can automatically attach to tabs.
 */
class ContentScript {
	/**
	 * @param  {object}  options  An object whose properties are assigned to the new instance.
	 *                            For the specific properties see below. Works as a copy constructor.
	 */
	constructor(options) {
		const self = {
			include: [ ], exclude: [ ], incognito: false,
			frames: 'top', runAt: 'document_end',
			modules: null, script: null, args: [ ],
		}; Self.set(this, self);
		Object.assign(this, options);
	}

	/**
	 * The MatchPattern or RegExps matching urls to include.
	 * @param  {[string|RegExp]}  include  An array of regular expression objects or strings. RegExps are cloned and
	 *                                     strings starting with '^' and ending with '$' are interpreted as RegExp sources.
	 *                                     Everything else must be valid MatchPatterns. Either way they are case insensitive.
	 * @throws {TypeError}                 If the description above is not met.
	 * @return {[string]}                  The sources of the created RegExps.
	 */
	set include(v)   { Self.get(this).include = parsePatterns(v); }
	get include()    { return Self.get(this).include.map(_=>_.source); }
	/**
	 * Same as .include, only that it can overrule includes to exclude them again.
	 */
	set exclude(v)   { Self.get(this).exclude = parsePatterns(v); }
	get exclude()    { return Self.get(this).exclude.map(_=>_.source); }
	/**
	 * Whether to include incognito tabs or not.
	 */
	set incognito(v) { Self.get(this).incognito = !!v; }
	get incognito()  { return Self.get(this).incognito; }
	/**
	 * The frames to run the ContentScript in.
	 * @param  {string}  frames  Enum:
	 *     'top'       Only execute in matching top level frames.
	 *     'matching'  Execute in all matching frames, regardless of the top level url.
	 */
	set frames(v)    { Self.get(this).frames = checkEnum([ 'top', 'matching', /*'children', 'all',*/ ], v); }
	get frames()     { return Self.get(this).frames; }
	/**
	 * The earliest time at which the script will be automatically run after tab navigations.
	 * Same as "run_at" in the "sontent_script"s of the `manifest.json`.
	 * Note though, that ContentScripts specified to run at 'document_start' are run later than the equivalent from the `manifest.json`.
	 */
	set runAt(v)     { Self.get(this).runAt = checkEnum([ 'document_end', 'document_idle', 'document_start', ], v); }
	get runAt()      { return Self.get(this).runAt; }
	/**
	 * The ids of the modules to load. Same as the modules parameter to requireInTab().
	 */
	set modules(v)   { if (typeof v !== 'object') { throw new Error(`'modules' must be an Array, object or null`); } Self.get(this).modules = v; }
	get modules()    { return Self.get(this).modules; }
	/**
	 * Function that is executed after all `.modules` specified in this ContentScript are loaded.
	 * @param  {function|null}  script  Same as the script parameter to runInTab().
	 * @return {string}                 The decompiled source of the function.
	 */
	set script(v)    { Self.get(this).script = v == null ? v : getScource(v); }
	get script()     { return Self.get(this).script; }
	/**
	 * Arguments to .script. Set as iterable, returned as Array.
	 */
	set args(v)      { Self.get(this).args = Array.from(v); }
	get args()       { return Self.get(this).args; }

	/**
	 * Applies the ContentScript to all already open tabs and frames it matches.
	 * @return {[object]}  An Array of { tabId, frameId, url, } describing all tabs this ContentScript was applied to.
	 */
	async applyNow() {
		const self = Self.get(this);
		const tabs = (await callChrome(chrome.tabs, 'query', { }));
		return [ ].concat(...(await Promise.all(tabs.map(async ({ id: tabId, incognito, }) => {
			return Promise.all((await callChrome(chrome.webNavigation, 'getAllFrames', { tabId, })).map(async ({ frameId, url, }) => {
				if (!ContentScript.prototype.matchesFrame.call(self, tabId, frameId, url, incognito)) { return 0; }
				try { (await ContentScript.prototype.applyToFrame.call(self, tabId, frameId)); } catch (error) { console.error(error); return 0; }
				return { tabId, frameId, url, };
			}));
		})))).filter(_=>_);
	}

	/**
	 * Applies the ContentScript to a specific frame now, regardless of whether it matches.
	 */
	async applyToFrame(tabId, frameId = 0) {
		// TODO: ensure that the tab doesn't navigate in between
		if (this.runAt === 'document_idle' || this.runAt === 'document_end') { (await request(tabId, frameId, 'waitFor', {
			document_end: 'interactive', document_idle: 'complete',
		}[this.runAt])); }
		const port = (await getPort(tabId, frameId));
		if (port.sender.tab.incognito && !this.incognito) { return; } // this should not be done here, but the tab.incognito info is currently not available earlier
		this.modules && (await requireInTab(tabId, frameId, this.modules));
		this.script && (await request(tabId, frameId, 'run', this.script, this.args));
	}

	/**
	 * Tests whether this ContentScript matches a tab described be the arguments.
	 * @param  {natural}  tabId      The tabId to match.
	 * @param  {natural}  frameId    The frameId to match.
	 * @param  {string}   url        The url to match.
	 * @param  {boolean}  incognito  The the incognito state of the tab.
	 * @return {boolean}             Whether this combination of (tabId, frameId, url) is matched.
	 */
	matchesFrame(tabId, frameId, url, incognito) {
		return (
			(this.frames !== 'top' || frameId < 1)
			&& (!incognito || this.incognito)
			&& (/^(?:https?|file|ftp|app):\/\//).test(url) // i.e. '<all_urls>'
			&& this.include.some(_=>_.test(url))
			&& !this.exclude.some(_=>_.test(url))
		);
	}

	/**
	 * Permanently disables the instance so that it will never run any scripts again and all accessors will throw.
	 */
	destroy() {
		Self.delete(this);
	}
}

//////// start of private implementation ////////

/// get config specified in the script tag via < data-...="..." >
const data = currentScript.dataset, config = { };
Object.keys(data).forEach(key => { try { config[key] = JSON.parse(data[key]); } catch(_) {config[key] = data[key]; } });

const chrome = (global.browser || global.chrome);
const rootUrl = chrome.extension.getURL('');
const contentPath = require.toUrl('./content.js').replace(rootUrl, '/');
const requirePath = config.requireScript || '/node_modules/es6lib/require.js';
const getScource = (() => { const { toString, } = (() => 0);
	return func => { if (typeof func !== 'function') { throw new Error(`'script' must be a function`); } return toString.call(func); };
})();
const callChrome = (api, method, ...args) => new Promise((y, n) => api[method](...args, value => n(chrome.runtime.lastError || y(value))));

const tabs = new Map/*<tabId, Map<frameId, { port, promise, resolve, reject, }>>*/;
const Self = new Map/*<ContentScript, object>*/;

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

async function onMessage(port, [ method, id, args, ]) {
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
		return new Promise((resolve, reject) => chrome.tabs.executeScript(this.sender.tab.id, { file, frameId: this.sender.frameId, matchAboutBlank: true, }, () => {
			if (!chrome.runtime.lastError) { resolve(true); }
			else { reject({ message: chrome.runtime.lastError.message, }); }
		}));
	},
	ping() {
		return true;
	},
};

function getPort(tabId, frameId) {
	if (!chrome.runtime.onConnect.hasListener(onConnect)) { throw new Error(`This module needs to be enabled by \`serveContentScripts(true)\`first`); }
	let frames = tabs.get(tabId);     if (!frames) { frames = new Map; tabs.set(tabId, frames); }
	let frame  = frames.get(frameId); if (!frame)  { frame  = { };     frames.set(frameId, frame); }
	if (frame.port || frame.promise) { return frame.port || frame.promise; }
	let reject; const promise = frame.promise = new Promise((y, n) => ((frame.resolve = y), (frame.reject = (reject = n))));
	Promise.all([ requirePath, contentPath, ].map(file => callChrome(chrome.tabs, 'executeScript', tabId, { file, frameId, matchAboutBlank: true, })))
	.catch(error => { reject(error); frame.promise === promise && (frame.promise = frame.resolve = frame.reject = null); });
	return promise;
}

function parsePatterns(patterns) {
	!chrome.webNavigation && console.warn(`Using ContentScripts without "webNavigation"!`);
	!Array.isArray(patterns) && (patterns = [ patterns, ]);
	return patterns.map(pattern => {
		if (typeof pattern === 'object' && typeof pattern.test === 'function') { return new RegExp(pattern); }
		if (typeof pattern === 'string' && pattern[0] === '^' && pattern.slice(-1) === '$') { return new RegExp(pattern, 'i'); }
		try { return matchPatternToRegExp(pattern); }
		catch (_) { throw new TypeError(`Expected (Array of) RegExp objects, MatchPattern strings or regexp strings framed with '^' and '$', got "${ pattern }"`); }
	});
}

function checkEnum(choices, value) {
	if (value == null) { return choices[0]; }
	if (choices.includes(value)) { return value; }
	throw new Error(`This value must be one of: '`+ choices.join(`', `) +`'`);
}

function onNavigation({ tabId, frameId, url, }) {
	const frames = tabs.get(tabId);
	const frame = frames && frames.get(frameId);
	frame && frame.doDicsonnect && frame.doDicsonnect();
	if (!(/^(?:https?|file|ftp|app):\/\//).test(url)) { return; } // i.e. '<all_urls>'
	Self.forEach(self => {
		if (!ContentScript.prototype.matchesFrame.call(self, tabId, frameId, url)) { return; }
		ContentScript.prototype.applyToFrame.call(self, tabId, frameId);
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

{
	typeof require.config === 'function' && require.config(config);
	if ('serveContentScripts' in config) { serveContentScripts(config.serveContentScripts); }
	chrome.webNavigation && chrome.webNavigation.onCommitted.addListener(onNavigation);
}

return {
	serveContentScripts,
	ContentScript,
	runInTab,
	requireInTab,
	parseMatchPatterns: parsePatterns,
};

}); })(this);
