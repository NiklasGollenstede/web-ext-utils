(function(global) { 'use strict'; prepare() && define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../browser/': { manifest, rootUrl, runtime, WebNavigation, Tabs, },
	'../browser/version': { gecko, current, version, },
	'../utils/': { parseMatchPatterns, },
	'../utils/event': { setEvent, setEventGetter, },
	'../utils/files': FS,
	require,
}) => {
const Self = new Map/*<ContentScript, object>*/;

/**
 * Dynamically executes functions as content scripts.
 * @param  {natural}       tabId    The id of the tab to run in.
 * @param  {natural}       frameId  Optional. The id of the frame within the tab to run in. Defaults to the top level frame.
 * @param  {function}      script   A function that will be decompiled and run as content script.
 *                                  If the "contentEval" manifest permission is set, this may also be a code string that will be wrapped in a function.
 * @param  {...any}        args     Arguments that will be cloned to call the function with.
 *                                  `this` in the function will be the global object (not necessarily `window`).
 * @return {any}                    The value returned or promised by `script`.
 * @throws {any}                    If `script` throws or otherwise fails to execute.
 */
async function runInTab(tabId, frameId, script, ...args) {
	if (typeof frameId !== 'number') { args.unshift(script); script = frameId; frameId = 0; }
	return (await Frame.get(tabId, frameId)).call(getScource(script), args);
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
	return (await Frame.get(tabId, frameId)).request('require', modules);
}

/**
 * Detaches all content scripts from the given context. Specifically, it performs the same steps for that context as when the extension is unloaded.
 * That is, it fires the onUnload event, deletes the global define and require functions and closes the loader connection.
 * @param  {natural}   tabId    The id of the tab to run in.
 * @param  {natural}   frameId  Optional. The id of the frame within the tab to run in. Defaults to the top level frame.
 */
async function detachFormTab(tabId, frameId) {
	const frame = (await Frame.getIf(tabId, frameId));
	frame && frame.destroy();
}

async function getFrame(tabId, frameId) {
	return (await Frame.get(tabId, frameId)).eventArg;
}

function register(prefix, files) {
	if (typeof prefix === 'string') {
		prefix = prefix.split('/'); if (prefix.shift() !== '' || prefix.pop() !== '') { throw new TypeError(`"prefix" must be an absolute path prefix`); }
	} else { prefix = prefix.slice(); }
	if (typeof files !== 'object') { throw new TypeError(`"files" must be an object`); }
	virtualFiles.add(prefix, files);
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
	set script(v)    { Self.get(this).script = v == null ? null : getScource(v); }
	get script()     { return Self.get(this).script; }

	/**
	 * Arguments to `.script`. Mutable array. Default is empty.
	 */
	set args(v)      { if (!Array.isArray(v)) { throw new Error(`'args' must be an Array`); } Self.get(this).args = v; }
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
		return applyIfMatches(tabId, frameId, Self.get(this), null);
	}

	/**
	 * Checks whether this ContentScript has been applied to a frame.
	 * @param  {natural}   tabId    The id of the tab to run in.
	 * @param  {natural}   frameId  Optional. The id of the frame within the tab to run in. Defaults to the top level frame.
	 * @return {boolean}            True iff this content script was applied to the given tab/frame.
	 */
	async appliedToFrame(tabId, frameId = 0) {
		const frame = tabs.has(tabId) && (await tabs.get(tabId).get(frameId));
		return frame && frame.scripts.has(Self.get(this)) || false;
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
} {
	/**
	 * Event that is fired whenever and as soon as this ContentSchript matches a frame.
	 * The arguments to the listeners are:
	 * @param  {Frame}    frame  The Frame that was matched.
	 * @param  {string}   url    The url of the matched frame at the time it was matched.
	 * @param  {Promise}  value  Promise that resolved after `.modules` resolved, with the return value of `.script`, if set.
	 */
	setEventGetter(ContentScript, 'match', Self);
	setEventGetter(ContentScript, 'show', Self);
	setEventGetter(ContentScript, 'hide', Self);
}

//////// start of private implementation ////////
/* eslint-disable no-throw-literal */ /* eslint-disable prefer-promise-reject-errors */

const contentPath = new global.URL(require.toUrl('./content.js')).pathname;
let cpWithArgs = contentPath + (gecko ? '?debug=false&info='+ encodeURIComponent(JSON.stringify({ name: current, version, })) : ''); // query params don't work in chrome
let requirePath = manifest.ext_tools && manifest.ext_tools.loader && manifest.ext_tools.loader.require;
requirePath === undefined && (requirePath = '/node_modules/es6lib/require.js');
const allowContentEval = manifest.permissions.includes('contentEval');
const getScource = ((f = x=>x, fromFunction = f.call.bind(f.toString)) =>
	code => allowContentEval && typeof code === 'string' ? `function() { ${ code } }` : fromFunction(code)
)();
const objectUrls = Object.create(null), virtualFiles = new Map; let useDataUrls = false;
const silentErrors = new WeakSet; let debug = false;

const tabs = new Map/*<tabId, Map<frameId, Promise<Frame>{ setPort(), }>>*/;

function initScript(_this) {
	const self = {
		include: [ ], exclude: [ ], incognito: false, frames: 'top',
		modules: null, script: null, args: [ ],
		onMatch: null, fireMatch: null,
		onShow: null, fireShow: null,
		onHide: null, fireHide: null,
	}; Self.set(_this, self);
}

function listenToNavigation() {
	if (!WebNavigation) { return; }
	const filters = [ ];
	Self.forEach(self => filters.push(...self.include.map(exp => ({ urlMatches: exp.source, }))));
	WebNavigation.onCommitted.removeListener(onNavigation); // always remove to avoid duplicate
	if (!filters.length) { return; }
	WebNavigation.onCommitted.addListener(onNavigation, { url: filters, });
}

async function applyScript(self) {
	const applied = new Set, tabs = (await Tabs.query({ }));
	(await Promise.all(tabs.map(async ({ id: tabId, incognito, }) => Promise.all(
		(self.fraames === 'top' ? [ 0, ] : (await WebNavigation.getAllFrames({ tabId, })))
		.map(async ({ frameId, url, }) => { try {
			const [ frame, , done, ] = (await applyIfMatches(tabId, frameId, self, url, incognito));
			(await done); applied.add(frame);
		} catch (error) { !silentErrors.has(error) && console.error(error); } })
	))));
	applied.delete(null); return applied;
}

async function onNavigation({ tabId, frameId, url, }) {
	if (!(/^(?:https?|file|ftp|app):\/\//).test(url) || gecko && url.startsWith('https://addons.mozilla.org')) { return; } // i.e. not '<all_urls>'
	frameId === 0 && Frame.resetTab(tabId);
	Self.forEach(self => applyIfMatches(tabId, frameId, self, url));
}

async function applyIfMatches(tabId, frameId, script, url = null, incognito = false/*not yet known*/) {
	if (url && (
		(script.frames === 'top' && frameId >= 1)
		|| incognito && !script.incognito
		|| !script.include.some(_=>_.test(url))
		|| script.exclude.some(_=>_.test(url))
	)) { return [ ]; }
	const frame = (await Frame.get(tabId, frameId));
	if (url && frame.incognito && !script.incognito) { return [ ]; }
	const done = Object.freeze((async () => {
		script.modules && (await (frame.requireReady = frame.request('require', script.modules)));
		return script.script ? frame.call(script.script, script.args) : undefined;
	})());
	url && script.fireMatch && script.fireMatch([ frame.eventArg, url, done, ]);
	frame.scripts.add(script);
	return [ frame.eventArg, null, done, ];
}

class Frame {
	constructor(tabId, frameId, port, promise) {
		this.tabId = tabId;
		this.frameId = frameId;
		this.port = port; port.frame = this;
		this.ready = promise;
		this.incognito = port.sender.tab.incognito;
		this.hidden = false;
		// this._parent = null;
		this.requireReady = null;
		this.onHide = null; this.fireHide = null;
		this.onShow = null; this.fireShow = null;
		this.onRemove = null; this.fireRemove = null;
		this.arg = null;
		this.scripts = new Set;
		this.destroy = this.destroy.bind(this);
		port.onDisconnect.addListener(this.destroy);
		global.addEventListener('unload', this.destroy);
	}

	static async get(tabId, frameId) {
		let frames = tabs.get(tabId); if (!frames) { frames = new Map; tabs.set(tabId, frames); }
		const frame = frames.get(frameId); if (frame) { return frame; }
		const promise = (async () => {
			const [ port, ] = (await Promise.all([
				new Promise(async got => { (await null); promise.setPort = got; }),
				Frame.prototype.run.call({ tabId, frameId, }, cpWithArgs),
			]).catch(error => {
				gecko && (error = new Error(`Can't access frame in tab ${ tabId }`));
				silentErrors.add(error); throw error;
			}));
			if (port instanceof Frame) { return port; }

			if (frames.get(frameId) !== promise) { throw new Error(`Failed to attach to tab: Tab was navigated`); }
			const frame = new Frame(tabId, frameId, port, promise);

			!gecko && debug && this.post('debug', true); // no query params in chrome
			if (requirePath) {
				frame.run(requirePath);
			} else {
				this.post('shimRequire');
			}

			if (frames.get(frameId) !== promise) { throw new Error(`Failed to attach to tab: Tab was navigated`); }
			return frame;
		})();
		frames.set(frameId, promise);
		return promise;
	}

	static getIf(tabId, frameId) {
		const frames = tabs.get(tabId);
		return frames && frames.get(frameId) || null;
	}

	static resetTab(tabId) {
		const frames = tabs.get(tabId);
		frames && frames.delete(0);
	}

	async request(method, ...args) {
		const id = Math.random() * 0x100000000000000;
		this.port.postMessage([ method, id, args, ]);
		return new Promise((resolve, reject) => this.port.requests.set(id, [ resolve, reject, ]));
	}
	async post(method, ...args) {
		this.port.postMessage([ method, 0, args, ]);
	}
	async run(file) {
		return Tabs.executeScript(this.tabId, { file, frameId: this.frameId, matchAboutBlank: true, runAt: 'document_start', });
	}
	async call(code, args) {
		!this.requireReady && (await (this.requireReady = this.request('require', [ ])));
		const id = Math.random() * 0x100000000000000;
		code = `require("${ contentPath.slice(0, -3) }").setScript(${ id }, ${ code })`;
		(await Tabs.executeScript(this.tabId, { code, frameId: this.frameId, matchAboutBlank: true, runAt: 'document_start', }));
		return this.request('callScript', id, args);
	}

	hide() {
		if (this.hidden) { return; } this.hidden = true;
		this.fireHide && this.fireHide([ this.eventArg, ]);
		this.scripts.forEach(script => script.fireHide && script.fireHide([ this.eventArg, ]));
		if (this.frameId !== 0) { return; }
		const frames = tabs.get(this.tabId);
		frames.get(this.frameId) === this.ready && frames.delete(this.frameId);
	}
	show() {
		if (!this.hidden) { return; } this.hidden = false;
		const frames = tabs.get(this.tabId), pending = frames.get(this.frameId);
		pending && pending !== this.ready && pending.setPort(this);
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
		global.removeEventListener('unload', this.destroy);
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
	if (!port.sender.tab) { port.sender.tab = { id: Math.random(), }; } // happens sometimes in fennec 55. This will also break incognito handling
	const { id: tabId, } = port.sender.tab;
	const { frameId, } = port.sender;
	port.requests = new Map/*<random, [ resolve, reject, ]>*/;
	port.onMessage.addListener(onMessage.bind(null, port));

	const pending = Frame.getIf(tabId, frameId); // will be null for static content_scripts
	if (!pending || !pending.setPort) { return void console.error(`Unexpected port connection for tab`, tabId, 'frame', frameId); } // if onDisconnect gets fired correctly, this can't happen
	pending.setPort(port); delete pending.setPort;
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
		if (FS.exists(file)) { return Tabs.executeScript(this.sender.tab.id, {
			file, frameId: this.sender.frameId, matchAboutBlank: true, runAt: 'document_start',
		}); }

		const segments = file.split('/'); let length = 0, found = null;
		for (const [ prefix, files, ] of virtualFiles) {
			if (prefix.length > segments.length && prefix.some((v, i) => v !== segments[i])) { continue; }
			if (!files || prefix.length > length) { length = prefix.length; found = [ files, ]; }
			else if (prefix.length === length) { found.push(files); }
		}
		const suffix = segments.slice(length).join('/');
		for (const files of found || [ ]) {
			const code = files[suffix]; if (code == null) { continue; }
			if (!allowContentEval) { throw { message: `Refused to load dynamic content script "${ file }" (manifest permission missing)`, }; }
			return Tabs.executeScript(this.sender.tab.id, {
				code, frameId: this.sender.frameId, matchAboutBlank: true, runAt: 'document_start',
			});
		}
		throw { message: `Could not find file "${ file }"`, };
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
	useDataUrls() {
		if (useDataUrls) { return; }
		console.warn(`Failed to load "blob:moz-extension:..." URL in content, using data:-URLs instead`);
		useDataUrls = true;
		Object.keys(objectUrls).forEach(key => delete objectUrls[key]);
	},
	async getUrl(url) {
		if (!url.startsWith(rootUrl)) { throw { message: 'Can only load local resources', }; }
		const id = url.slice(rootUrl.length - 1);
		if (objectUrls[id]) { return objectUrls[id]; }
		const blob = (await (await global.fetch(url)).blob());
		return (objectUrls[id] = useDataUrls
			? blobToDataUrl(blob)
			: global.URL.createObjectURL(blob)
		);
	},
};

function blobToDataUrl(blob) { return new Promise((resolve, reject) => {
	const reader = new global.FileReader();
	reader.onloadend = () => resolve(reader.result);
	reader.onerror = () => reject(new Error(`Failed to convert blob to data:-URL`));
	reader.readAsDataURL(blob);
}); }

function parsePatterns(patterns) {
	!WebNavigation && console.warn(`Using ContentScripts without "WebNavigation"!`);
	return parseMatchPatterns(patterns);
}

function checkEnum(choices, value) {
	if (value == null) { return choices[0]; }
	if (choices.includes(value)) { return value; }
	throw new Error(`This value must be one of: '`+ choices.join(`', `) +`'`);
}

function setDebug(value) {
	value = !!value; if (debug === value) { return; } debug = value;
	gecko && (cpWithArgs = cpWithArgs.replace(/&debug=(true|false)/, '&debug='+ debug));
	tabs.forEach(_=>_.forEach(frame => frame.port && !frame.hidden && frame.post('debug', debug)));
}

{
	runtime.onConnect.addListener(onConnect);
}

return Object.freeze({
	ContentScript,
	runInTab,
	requireInTab,
	detachFormTab,
	getFrame,
	register,
	set debug(v) { setDebug(v); }, get debug() { return debug; },
});

}); function prepare() {

if (global.innerWidth || global.innerHeight) { // stop loading at once if the background page was opened in a tab or window
	console.warn(`Background page opened in view`);
	global.history.replaceState({ from: global.location.href.slice(global.location.origin.length), }, null, '/view.html#403');
	global.stop(); global.location.reload();
	return false;
} else { return true; }

} })(this);
