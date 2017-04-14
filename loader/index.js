(function(global) { 'use strict'; prepare() && define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../browser/': { manifest, rootUrl, runtime, WebNavigation, Tabs, },
	'../browser/version': { gecko, current, version, },
	'../utils/event': { setEvent, },
	require,
	exports,
}) => {

/**
 * Dynamically executes functions as content scripts.
 * @param  {natural}       tabId    The id of the tab to run in.
 * @param  {natural}       frameId  Optional. The id of the frame within the tab to run in. Defaults to the top level frame.
 * @param  {function}      script   A function that will be decompiled and run as content script.
 * @param  {...any}        args     Arguments that will be cloned to call the function with.
 *                                  `this` in the function will be the global object (not necessarily `window`).
 * @return {any}                    The value returned or promised by `script`.
 * @throws {any}                    If `script` throws or otherwise fails to execute.
 */
async function runInTab(tabId, frameId, script, ...args) {
	if (typeof frameId !== 'number') { args.unshift(script); script = frameId; frameId = 0; }
	return Frame.get(tabId, frameId).request('run', getScource(script), args);
}

/**
 * Dynamically loads content scripts by `require()`ing them in the content context.
 * @param  {natural}          tabId    The id of the tab to run in.
 * @param  {natural}          frameId  Optional. The id of the frame within the tab to run in. Defaults to the top level frame.
 * @param  {[string]|object}  modules  An Array if module ids to load, or an object where each key is a module id
 *                                     and the values will be made available as `module.config()`.
 * @return {natural}                   The number of modules loaded.
 * @throws {any}                       If any of the modules throws or otherwise fails to load.
 */
async function requireInTab(tabId, frameId, modules) {
	if (typeof frameId !== 'number') { modules = frameId; frameId = 0; }
	return Frame.get(tabId, frameId).request('require', modules);
}

/**
 * Detaches all content scripts from the given context. Specifically, it performs the same steps for that context as when the extension is unloaded.
 * That is, it fires the onUnload event, deletes the global define and require functions and closes the loader connection.
 * @param  {natural}   tabId    The id of the tab to run in.
 * @param  {natural}   frameId  Optional. The id of the frame within the tab to run in. Defaults to the top level frame.
 */
async function detachFormTab(tabId, frameId) {
	const frames = tabs.get(tabId);
	const frame = frames && frames.get(frameId);
	frame && frame.destroy();
}

function getFrame(tabId, frameId) {
	return Frame.get(tabId, frameId).eventArg;
}

/**
 * Defines a content script that can automatically attach to tabs.
 */
class ContentScript {
	/**
	 * @param  {object}  options  An object whose properties are assigned to the new instance.
	 *                            For the specific properties see below.
	 */
	constructor(options) {
		initScript(this);
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
	set include(v)   { Self.get(this).include = parsePatterns(v); listenToNavigation(); }
	get include()    { return Self.get(this).include.map(_=>_.source); }

	/**
	 * Same format as `.include`. Frames with matching URLs will not be included, even if they are also matched by include patterns.
	 */
	set exclude(v)   { Self.get(this).exclude = parsePatterns(v); }
	get exclude()    { return Self.get(this).exclude.map(_=>_.source); }

	/**
	 * Whether to include incognito tabs or not. Defaults to false.
	 */
	set incognito(v) { Self.get(this).incognito = !!v; }
	get incognito()  { return Self.get(this).incognito; }

	/**
	 * The frames to run the ContentScript in.
	 * @param  {string}  frames  Enum:
	 *     'top'       Only execute in matching top level frames. Default value.
	 *     'matching'  Execute in all matching frames, regardless of the top level url.
	 */
	set frames(v)    { Self.get(this).frames = checkEnum([ 'top', 'matching', /*'children', 'all',*/ ], v); }
	get frames()     { return Self.get(this).frames; }

	/**
	 * The ids of the modules to load. Same as the `modules` parameter to `requireInTab()`.
	 */
	set modules(v)   { if (typeof v !== 'object') { throw new Error(`'modules' must be an Array, object or null`); } Self.get(this).modules = v; }
	get modules()    { return Self.get(this).modules; }

	/**
	 * Function that is executed after all `.modules` specified in this ContentScript are loaded. Should return (a Promise to) a JSONable value.
	 * @param  {function|null}  script  Same as the script parameter to runInTab().
	 * @return {string|null}            The decompiled source of the function, if set.
	 */
	set script(v)    { Self.get(this).script = v == null ? v : getScource(v); }
	get script()     { return Self.get(this).script; }

	/**
	 * Arguments to `.script`. Set as iterable, returned as Array. Default is empty.
	 */
	set args(v)      { Self.get(this).args = Array.from(v); }
	get args()       { return Self.get(this).args; }

	/**
	 * Applies the ContentScript to all already open tabs and frames it matches.
	 * @return {Set<Frame>}  An of all the Frames this ContentScript was applied to.
	 */
	async applyNow() {
		return applyScript(Self.get(this));
	}

	/**
	 * Applies the ContentScript to a specific frame now, regardless of whether it matches.
	 * @param  {natural}   tabId    The id of the tab to run in.
	 * @param  {natural}   frameId  Optional. The id of the frame within the tab to run in. Defaults to the top level frame.
	 * @return {[Frame, null, Promise]}  The Frame applied to, null (unknown URL), and a Promise that resolves after all `.modules` resolved, with the return value of `.script`, if set.
	 */
	async applyToFrame(tabId, frameId = 0) {
		return Frame.get(tabId, frameId).applyIfMatches(Self.get(this), null);
	}

	/**
	 * Event that is fired whenever and as soon as this ContentSchript matches a frame.
	 * The arguments to the listeners are:
	 * @param  {Frame}    frame  The Frame that was matched.
	 * @param  {string}   url    The url of the matched frame at the time it was matched.
	 * @param  {Promise}  value  Promise that resolved after `.modules` resolved, with the return value of `.script`, if set.
	 * @return {Event}    Read-only.
	 */
	get onMatch() {
		const self = Self.get(this); if (self.onMatch) { return self.onMatch; }
		self.fireMatch = setEvent(self, 'onMatch', { lazy: false, }); return self.onMatch;
	}

	get onShow() {
		const self = Self.get(this); if (self.onShow) { return self.onShow; }
		self.fireShow = setEvent(self, 'onShow', { lazy: false, }); return self.onShow;
	}

	get onHide() {
		const self = Self.get(this); if (self.onHide) { return self.onHide; }
		self.fireHide = setEvent(self, 'onHide', { lazy: false, }); return self.onHide;
	}

	/**
	 * Permanently disables the instance so that it will never run any scripts again and all accessors will throw.
	 */
	destroy() {
		const self = Self.get(this);
		if (!self) { return; } Self.delete(this);
		self.fireMatch && self.fireMatch(null, { last: true, });
		self.fireShow && self.fireShow(null, { last: true, });
		self.fireHide && self.fireHide(null, { last: true, });
		self.include.length && listenToNavigation();
	}
}

//////// start of private implementation ////////
/* eslint-disable no-throw-literal */ /* eslint-disable prefer-promise-reject-errors */

let contentPath = new global.URL(require.toUrl('./content.js')).pathname
+ (gecko ? '?debug=false&info='+ encodeURIComponent(JSON.stringify({ name: current, version, })) : ''); // query params don't work in chrome
let requirePath = manifest.ext_tools && manifest.ext_tools.loader && manifest.ext_tools.loader.require;
requirePath === undefined && (requirePath = '/node_modules/es6lib/require.js');
const getScource = (x=>x).call.bind((x=>x).toString);
const objectUrls = Object.create(null);
let debug = false;

const tabs = new Map/*<tabId, Map<frameId, Frame>>*/;
const Self = new Map/*<ContentScript, object>*/;

function initScript(_this) {
	const self = {
		include: [ ], exclude: [ ], incognito: false, frames: 'top',
		modules: null, script: null, args: [ ],
		onMatch: null, fireMatch: null,
		onShow: null, fireShow: null,
		onHide: null, fireHide: null,
	}; Self.set(_this, self);
}

async function applyScript(self) {
	const applied = new Set, tabs = (await Tabs.query({ }));
	(await Promise.all(tabs.map(async ({ id: tabId, incognito, }) => Promise.all(
		(await WebNavigation.getAllFrames({ tabId, }))
		.map(async ({ frameId, url, }) => { try {
			const [ frame, , done, ] = (await Frame.get(tabId, frameId).applyIfMatches(self, url, incognito));
			(await done); applied.add(frame);
		} catch (error) { console.error(error); } })
	))));
	applied.delete(null); return applied;
}

function listenToNavigation() {
	if (!WebNavigation) { return; }
	const filters = [ ];
	Self.forEach(self => filters.push(...self.include.map(exp => ({ urlMatches: exp.source, }))));
	WebNavigation.onCommitted.removeListener(onNavigation); // must remove first to avoid duplicate
	if (!filters.length) { return; }
	WebNavigation.onCommitted.addListener(onNavigation, { url: filters, });
}

function onNavigation({ tabId, frameId, url, }) {
	if (!(/^(?:https?|file|ftp|app):\/\//).test(url)) { return; } // i.e. '<all_urls>'
	const frame = Frame.get(tabId, frameId, true);
	Self.forEach(self => frame.applyIfMatches(self, url));
}

class Frame {
	constructor(tabId, frameId) {
		this.tabId = tabId;
		this.frameId = frameId;
		this.incognito = true;
		this.hidden = false;
		// this._parent = null;
		this.port = null;
		this.gettingPort = null;
		this.gotPort = null;
		this.cancelPort = null;
		this.inited = false;
		this.onhide = null;
		this.onshow = null;
		this.onremove = null;
		this.arg = null;
		this.scripts = new Set;
		this.destroy = this.destroy.bind(this);
	}

	static get(tabId, frameId, refresh) {
		let frames = tabs.get(tabId); if (!frames) { frames = new Map; tabs.set(tabId, frames); }
		refresh && frameId === 0 && frames.delete(frameId);
		let frame = frames.get(frameId); if (!frame) { frame = new Frame(tabId, frameId); frames.set(frameId, frame); }
		return frame;
	}

	async getPort() {
		let reject; this.gettingPort = new Promise((y, n) => ((this.gotPort = y), (reject = (this.cancelPort = n))));
		Tabs.executeScript(this.tabId, {
			file: contentPath, frameId: this.frameId, matchAboutBlank: true, runAt: 'document_start',
		}).catch(reject);
		return this.gettingPort;
	}
	setPort(port) {
		this.port = port;
		port.frame = this;
		this.incognito = port.sender.tab.incognito;
		this.gotPort && this.gotPort();
		this.gotPort = null;
		this.fireShow && this.fireShow([ this.eventArg, ]);
	}
	initContent() {
		!gecko && debug && this.post('debug', true); // no query params in chrome
		if (requirePath) {
			Tabs.executeScript(this.tabId, { file: requirePath, frameId: this.frameId, matchAboutBlank: true, runAt: 'document_start', });
		} else {
			this.post('shimRequire');
		}
	}

	async request(method, ...args) {
		if (!this.port) { (await (this.gettingPort || this.getPort())); }
		if (!this.inited) { this.inited = true; this.initContent(); }
		const id = Math.random() * 0x100000000000000;
		this.port.postMessage([ method, id, args, ]);
		return new Promise((resolve, reject) => this.port.requests.set(id, [ resolve, reject, ]));
	}
	async post(method, ...args) {
		if (!this.port) { (await (this.gettingPort || this.getPort())); }
		if (!this.inited) { this.inited = true; this.initContent(); }
		this.port.postMessage([ method, 0, args, ]);
	}

	async applyIfMatches(script, url = null, incognito = false) {
		if (url && (
			(script.frames === 'top' && this.frameId >= 1)
			|| incognito && !script.incognito
			|| !script.include.some(_=>_.test(url))
			|| script.exclude.some(_=>_.test(url))
		)) { return [ ]; }
		try { if (!this.port) { (await (this.gettingPort || this.getPort())); } }
		catch (error) { if (error !== this) { throw error; } else { return [ ]; } } // error === this if canceled due to pageshow
		if (url && this.incognito && !script.incognito) { return [ ]; }
		const done = Object.freeze((async () => {
			script.modules && (await this.request('require', script.modules));
			return script.script ? this.request('run', script.script, script.args) : undefined;
		})());
		url && script.fireMatch && script.fireMatch([ this.eventArg, url, done, ]);
		this.scripts.add(script);
		return [ this.eventArg, null, done, ];
	}

	hide() {
		if (this.hidden) { return; } this.hidden = true;
		this.fireHide && this.fireHide([ this.eventArg, ]);
		this.scripts.forEach(script => script.fireHide && script.fireHide([ this.eventArg, ]));
		const frames = tabs.get(this.tabId);
		this.frameId === 0 && frames.get(this.frameId) === this && frames.delete(this.frameId);
	}
	show() {
		if (!this.hidden) { return; } this.hidden = false;
		const frames = tabs.get(this.tabId), old = frames.get(this.frameId);
		old && old !== this && old.cancelPort && old.cancelPort(old);
		this.frameId === 0 && frames.set(this.frameId, this);
		this.fireShow && this.fireShow([ this.eventArg, ]);
		this.scripts.forEach(script => script.fireShow && script.fireShow([ this.eventArg, ]));
	}

	get eventArg() { const self = this; if (!this.arg) { this.arg = Object.freeze({
		tabId: self.tabId,
		frameId: self.frameId,
		incognito: self.incognito,
		get hidden() { return self.hidden; },
		get onShow() {
			if (self.onShow) { return self.onShow; }
			self.fireShow = setEvent(self, 'onShow', { lazy: false, }); return self.onShow;
		},
		get onHide() {
			if (self.onHide) { return self.onHide; }
			self.fireHide = setEvent(self, 'onHide', { lazy: false, }); return self.onHide;
		},
		get onRemove() {
			if (self.onRemove) { return self.onRemove; }
			self.fireRemove = setEvent(self, 'onRemove', { lazy: false, once: true, }); return self.onRemove;
		},
	}); } return this.arg; }

	destroy(unload) {
		this.hide();
		const frames = tabs.get(this.tabId);
		frames && frames.get(this.frameId) === this && frames.delete(this.frameId);
		this.fireShow && this.fireShow(null, { last: true, });
		this.fireHide && this.fireHide(null, { last: true, });
		this.fireRemove && this.fireRemove(unload ? null : [ this.eventArg, ]);
		this.port && this.port.onDisconnect.removeListener(this.destroy);
		this.port && this.port.disconnect();
		this.port && delete this.port.frame && delete this.port;
		this.scripts.clear();
	}
}

function onConnect(port) {
	if (port.name !== 'require.scriptLoader') { return; }
	const { id: tabId, } = port.sender.tab;
	const { frameId, } = port.sender;
	port.requests = new Map/*<random, [ resolve, reject, ]>*/;
	port.onMessage.addListener(onMessage.bind(null, port));

	const frame = Frame.get(tabId, frameId);
	if (frame.port) { console.error(`Frame already has a port`, frame.port, frame); } // if onDisconnect gets fired correctly, this can't happen
	frame.setPort(port);
	port.onDisconnect.addListener(frame.destroy);
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

const methods = {
	loadScript(url) {
		if (!url.startsWith(rootUrl)) { throw { message: 'Can only load local resources', }; }
		const file = url.slice(rootUrl.length - 1);
		return Tabs.executeScript(this.sender.tab.id, {
			file, frameId: this.sender.frameId, matchAboutBlank: true, runAt: 'document_start',
		});
	},
	ping() {
		return true;
	},
	pagehide() {
		this.frame.hide();
	},
	pageshow() {
		this.frame.show();
	},
	async getUrl(url) {
		if (!url.startsWith(rootUrl)) { throw { message: 'Can only load local resources', }; }
		const id = url.slice(rootUrl.length - 1);
		if (objectUrls[id]) { return objectUrls[id]; }
		const blob = (await (await global.fetch(url)).blob());
		return global.URL.createObjectURL(blob);
	},
};

function parsePatterns(patterns) {
	!WebNavigation && console.warn(`Using ContentScripts without "WebNavigation"!`);
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

function setDebug(value) {
	value = !!value; if (debug === value) { return; } debug = value;
	contentPath = contentPath.replace(/&debug=(true|false)/, '&debug='+ debug);
	tabs.forEach(_=>_.forEach(frame => frame.port && !frame.hidden && frame.post('debug', debug)));
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

global.addEventListener('unload', () => {
	tabs.forEach(_=>_.forEach(frame => Frame.prototype.destroy.call(frame, true)));
	tabs.clear();
});

{
	runtime.onConnect.addListener(onConnect);
}

Object.assign(exports, {
	ContentScript,
	runInTab,
	requireInTab,
	detachFormTab,
	getFrame,
	parseMatchPatterns: parsePatterns,
});
Object.defineProperty(exports, 'debug', { set: setDebug, get() { return debug; }, configurable: true, });

}); function prepare() {

if (global.innerWidth || global.innerHeight) { // stop loading at once if the background page was opened in a tab or window
	console.warn(`Background page opened in view`);
	global.history.replaceState({ from: global.location.href.slice(global.location.origin.length), }, null, '/view.html#403');
	global.stop(); global.location.reload();
	return false;
} else { return true; }

} })(this);
