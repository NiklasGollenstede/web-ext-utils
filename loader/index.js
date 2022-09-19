(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'module!../browser/': { manifest, rootUrl, runtime, WebNavigation, Tabs, }, 'module!../browser/': Browser,
	'module!../browser/version': { gecko, edge, },
	'../utils/': { parseMatchPatterns, },
	'module!node_modules/web-ext-event/': { setEvent, setEventGetter, },
	'../utils/files': FS,
	require,
	'lazy!./multiplex': _1,
	'lazy!./content': _2,
}) => {
const Self = new Map/*<ContentScript, object>*/;

/**
 * Dynamically executes functions as content scripts.
 * @param  {number|null}     tabId    The id of the tab to run in. Default to an active tab, preferably in the current window.
 * @param  {number|null}     frameId  The id of the frame within the tab to run in. Defaults to the top level frame.
 * @param  {function|string}  script   A function that will be decompiled and run as content script.
 *                                     If the "contentEval" manifest permission is set, this may also be a code string that will be wrapped in a function.
 * @param  {...any}           args     Arguments that will be cloned to call the function with.
 *                                     `this` in the function will be the global object (not necessarily `window`).
 * @return {Promise<any>}              The value returned or promised by `script`.
 * @throws {any}                       If `script` throws or otherwise fails to execute.
 */
async function runInFrame(tabId, frameId, script, ...args) {
	if (typeof tabId !== 'number') { tabId = (await getActiveTabId()); }
	return (await Frame.get(tabId, frameId || 0)).call(getScource(script), args);
}

/**
 * Dynamically loads content scripts by `require()`ing them in the content context.
 * @param  {number|null}     tabId    The id of the tab to run in. Default to an active tab, preferably in the current window.
 * @param  {number|null}     frameId  The id of the frame within the tab to run in. Defaults to the top level frame.
 * @param  {[string]|object}  modules  An Array if module ids to load, or an object where each key is a module id
 *                                     and the values will be made available as `module.config()`.
 * @return {Promise<number>}           The number of modules loaded.
 * @throws {any}                       If any of the modules throws or otherwise fails to load.
 */
async function requireInFrame(tabId, frameId, modules) {
	if (typeof tabId !== 'number') { tabId = (await getActiveTabId()); }
	return (await Frame.get(tabId, frameId || 0)).request('require', modules);
}

/**
 * Detaches all content scripts from the given context. Specifically, it performs the same steps for that context as when the extension is unloaded.
 * That is, it fires the onUnload event (both on the frame reference and in the content script),
 * deletes the global define and require functions and closes the loader connection.
 * @param  {number|null}     tabId    The id of the tab to run in. Default to an active tab, preferably in the current window.
 * @param  {number|null}     frameId  The id of the frame within the tab to run in. Defaults to the top level frame.
 */
async function unloadFrame(tabId, frameId) {
	if (typeof tabId !== 'number') { tabId = (await getActiveTabId()); }
	const frames = tabs.get(tabId);
	const frame = frames && frames.get(frameId || 0);
	frame && (await frame).destroy();
}

async function getFrame(tabId, frameId) {
	if (typeof tabId !== 'number') { tabId = (await getActiveTabId()); }
	return (await Frame.get(tabId, frameId || 0)).eventArg;
}

function register(prefix, files) {
	if (typeof prefix === 'string') {
		prefix = prefix.split('/'); if (prefix.shift() !== '' || prefix.pop() !== '') { throw new TypeError(`"prefix" must be an absolute path prefix`); }
	} else { prefix = prefix.slice(); }
	if (typeof files !== 'object') { throw new TypeError(`"files" must be an object`); }
	virtualFiles.set(prefix, files);
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
	set include(include) { Self.get(this).include = parsePatterns(include); listenToNavigation(); }
	get include() { return Self.get(this).include.map(_=>_.source); }

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
	set frames(frames) { if (edge) { return; } Self.get(this).frames = checkEnum([ 'top', 'matching', /*'children', 'all',*/ ], frames); }
	get frames() { return Self.get(this).frames; }

	/**
	 * The ids of the modules to load. Same as the `modules` parameter to `requireInFrame()`.
	 */
	set modules(v)   { if (typeof v !== 'object') { throw new TypeError(`'modules' must be an Array, object or null`); } Self.get(this).modules = v; }
	get modules()    { return Self.get(this).modules; }

	/**
	 * Function that is executed after all `.modules` specified in this ContentScript are loaded. Should return (a Promise to) a JSONable value.
	 * @param  {function|null}  script  Same as the script parameter to runInFrame().
	 * @return {string|null}            The decompiled source of the function, if set.
	 */
	set script(script) {  Self.get(this).script = script == null ? null : getScource(script); }
	get script() { return Self.get(this).script; }

	/**
	 * Arguments to `.script`. Mutable array. Default is empty.
	 */
	set args(v)      { if (!Array.isArray(v)) { throw new TypeError(`'args' must be an Array`); } Self.get(this).args = v; }
	get args()       { return Self.get(this).args; }

	/**
	 * Applies the ContentScript to all already open tabs and frames it matches.
	 * Does NOT throw if the content script can't be applied to or throws for individual tabs.
	 * @return {Promise<Set<Frame>>}  An of all the Frames this ContentScript was successfully applied to.
	 */
	async applyNow() {
		return applyScript(Self.get(this));
	}

	/**
	 * Applies the ContentScript to a specific frame now, regardless of whether it matches.
	 * @param  {number|null}     tabId    The id of the tab to run in. Default to an active tab, preferably in the current window.
	 * @param  {number|null}     frameId  The id of the frame within the tab to run in. Defaults to the top level frame.
	 * @return {Promise<any[] | [ Frame, null, Promise, ]>}    The Frame applied to, null (unknown URL), and a Promise that resolves after all `.modules` resolved, with the return value of `.script`, if set.
	 */
	async applyToFrame(tabId, frameId) {
		if (typeof tabId !== 'number') { tabId = (await getActiveTabId()); }
		return applyIfMatches({ tabId, frameId: frameId || 0, script: Self.get(this), });
	}

	/**
	 * Checks whether this ContentScript has been applied to a frame.
	 * @param  {number|null}     tabId    The id of the tab to run in. Default to an active tab, preferably in the current window.
	 * @param  {number|null}     frameId  The id of the frame within the tab to run in. Defaults to the top level frame.
	 * @return {Promise<boolean>}                   True iff this content script was applied to the given tab/frame.
	 */
	async appliedToFrame(tabId, frameId) {
		if (typeof tabId !== 'number') { tabId = (await getActiveTabId()); }
		const frame = tabs.has(tabId) && (await tabs.get(tabId).get(frameId || 0));
		return frame && frame.scripts.has(Self.get(this)) || false;
	}

	/**
	 * Permanently disables the instance so that it will never run any scripts again and all accessors will throw.
	 */
	destroy() {
		const self = Self.get(this);
		if (!self) { return; } Self.delete(this);
		self.fireMatch && self.fireMatch(null, { last: true, });
		self.fireUnload && self.fireUnload(null, { last: true, });
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
	setEventGetter(ContentScript, 'Match', Self);
	/**
	 * Event that gets fired after the content script in a frame was unloaded,
	 * either because it's tab/window was closed, navigated or explicitly `unloadFrame`ed.
	 */
	setEventGetter(ContentScript, 'Unload', Self);
}

//////// start of private implementation ////////
/* eslint-disable no-throw-literal */ /* eslint-disable prefer-promise-reject-errors */

const contentPath = new global.URL(require.toUrl('./content.js')).pathname;
const requirePath = new global.URL(require.toUrl('node_modules/pbq/require.js')).pathname;
const allowContentEval = (gecko ? (await Browser.rawManifest) : manifest).permissions.includes('contentEval');
const getScource = ((f = x=>x, fromFunction = f.call.bind(f.toString)) =>
	code => allowContentEval && typeof code === 'string' ? `function() { ${ code } }` : fromFunction(code)
)();
const objectUrls = Object.create(null), virtualFiles = new Map; let useDataUrls = false;
const silentErrors = new WeakSet; let debug = false;
const getActiveTabId = async () => ((await Tabs.query({ currentWindow: true, active: true, }))[0] || (await Tabs.query({ active: true, }))[0]).id;
const tabs = new Map/*<tabId, Map<frameId, Promise<Frame>{ setPort(), }>>*/;
const options = { }; let optionsAsGlobal = '', optionsAsQuery = '';
const baseUrl = require.toUrl('/').slice(rootUrl.length); baseUrl && setOptions({ baseUrl, });
function setOptions(props) {
	Object.assign(options, props);
	if (gecko || edge) { // query params don't work in chrome
		optionsAsQuery = '?'+ Object.keys(options).map(key => encodeURIComponent(key) +'='+ encodeURIComponent(JSON.stringify(options[key]))).join('&');
	} else {
		optionsAsGlobal = `this.__options__ = ${ JSON.stringify(options) }`;
	}
	tabs.forEach(_=>_.forEach(frame => frame.port && !frame.hidden && frame.post('setOptions', props)));
}

function initScript(_this) {
	const self = {
		include: [ ], exclude: [ ], incognito: false, frames: 'top',
		modules: null, script: null, args: [ ],
		onMatch: null, fireMatch: null,
		onUnload: null, fireUnload: null,
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

async function onNavigation({ tabId, frameId, url, }) {
	debug && console.info('onNavigation', { tabId, frameId, url, });
	if (edge && frameId || !isScripable(url)) { return; } // i.e. not '<all_urls>'
	frameId === 0 && Frame.resetTab(tabId);
	Promise.all(Array.from(Self.values(), script => applyIfMatches({ tabId, frameId, script, url, })))
	.catch(error => console.error('Failed to attach scripts during navigation', error));
}

async function applyScript(script) {
	const applied = new Set, tabs = (await Tabs.query({
		discarded: false, url: '<all_urls>',
	}));
	(await Promise.all(tabs.map(async ({
		id: tabId, url, incognito, title,
	}) => { return Promise.all(
		(script.frames === 'top'
			? [ url // top frame is enough
				? { frameId: 0, url, } // with "tabs" permission
				: ((await WebNavigation.getFrame({ tabId, frameId: 0, })))
				|| { }, // tab not accessible
			]
			: (await WebNavigation.getAllFrames({ tabId, }))
		).map(async ({ frameId = 0, url = null, }) => { try {
			if (!isScripable(url)) { return; } // i.e. not '<all_urls>'
			const [ frame, , done, ] = (await applyIfMatches({
				tabId, frameId, script, url, incognito,
			}));
			(await done); frame && applied.add(frame);
		} catch (error) {
			!silentErrors.has(error) && console.error(`Error injecting into tab ${ tabId } (${ title }) frame ${ frameId }`, error);
		} })
	); })));
	return applied;
}

async function applyIfMatches({ tabId, frameId, script, url = null, incognito = false/*not yet known*/, }) {
	if (url && (
		(script.frames === 'top' && frameId >= 1)
		|| incognito && !script.incognito
		|| !script.include.some(_=>_.test(url))
		|| script.exclude.some(_=>_.test(url))
	)) { return [ ]; }
	const frame = (await Frame.get(tabId, frameId));
	if (url && frame.incognito && !script.incognito) { return [ ]; }
	const done = Object.freeze((async () => {
		script.modules && (await frame.request('require', script.modules));
		return script.script ? frame.call(script.script, script.args) : undefined;
	})());
	url && script.fireMatch && script.fireMatch([ frame.eventArg, url, done, ]);
	frame.scripts.add(script);
	return /**@type{[ Frame, null, Promise, ]} */([ frame.eventArg, null, done, ]);
}

class Frame {
	constructor(tabId, frameId, port, promise) {
		this.tabId = tabId;
		this.frameId = frameId;
		this.port = port; port.frame = this;
		this.promise = promise;
		this.incognito = port.sender.tab.incognito;
		this.hidden = false;
		this.connections = Object.create(null);
		// this._parent = null;
		this.onUnload = null; this.fireUnload = null;
		this.arg = null;
		this.scripts = new Set;
		this.destroy = this.destroy.bind(this);
		port.onDisconnect.addListener(this.destroy);
		global.addEventListener('unload', this.destroy);
	}

	static async get(tabId, frameId) {
		let frames = tabs.get(tabId); if (!frames) { frames = new Map; tabs.set(tabId, frames); }
		let promise = frames.get(frameId); if (promise) { return promise; }
		promise = (async () => {
			const [ port, ] = (await Promise.all([
				new Promise(got => { Promise.resolve().then(() => (promise.setPort = got)); }),
				optionsAsGlobal && Tabs.executeScript(tabId, { frameId, matchAboutBlank: true, runAt: 'document_start', code: optionsAsGlobal, }),
				Frame.run(tabId, frameId, contentPath + optionsAsQuery/* + (gecko ? '&t='+ tabId : '')*/),
				Frame.run(tabId, frameId, requirePath),
			]).catch(error => {
				gecko && console.error(`Can't access frame ${frameId} in tab ${tabId}`, error);
				gecko && (error = new Error(`Can't access frame ${frameId} in tab ${tabId}`));
				typeof error === 'object' && error && silentErrors.add(error); throw error;
			}));

			if (frames.get(frameId) !== promise) { throw new Error(`Failed to attach to tab: Tab was navigated`); }
			return new Frame(tabId, frameId, port, promise);
		})();
		frames.set(frameId, promise);
		return promise;
	}
	static resetTab(tabId) {
		const tab = tabs.get(tabId);
		tab && tab.forEach(_=>_.then(_=>_.destroy()));
		tab && tab.clear();
	}

	static async run(tabId, frameId, file) {
		if (edge) { if (frameId) { throw new Error(`Can't run scripts in subframes`); } else { return Tabs.executeScript(tabId, { file, }); } }
		return Tabs.executeScript(tabId, { file, frameId, matchAboutBlank: true, runAt: 'document_start', });
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
		return Frame.run(this.tabId, this.frameId, file);
	}
	async call(code, args) {
		const id = Math.random().toString(32).slice(2);
		code = `require("${ contentPath.slice(0, -3) }").__setScript__("${ id }", ${ code })`;
		(await Tabs.executeScript(this.tabId, { code, frameId: this.frameId, matchAboutBlank: true, runAt: 'document_start', }));
		return this.request('callScript', id, args);
	}

	async connect({ name, wait, content, }) {
		const pending = this.connections[name];
		if (pending) {
			if (!pending.resolve || pending.content === content) { throw new Error(`Connection name "${ name }" is already in use`); }
			pending.resolve(); pending.resolve = null;
		} else if (wait) {
			(await new Promise((resolve, reject) => {
				const pending = this.connections[name] = { content, resolve, };
				this.eventArg.onUnload(() => pending.resolve && reject({ message: 'Frame navigated', }));
			}));
		} else { return false; }
		return true;
	}

	get eventArg() { const self = this; if (!this.arg) { this.arg = Object.freeze({
		tabId: self.tabId,
		frameId: self.frameId,
		incognito: self.incognito,
		get hidden() { return self.hidden; },
		get onUnload() {
			if (self.onUnload) { return self.onUnload; }
			self.fireUnload = setEvent(self, 'onUnload', { lazy: false, once: true, }); return self.onUnload;
		},
		async connect(name, { wait = true, } = { }) {
			const [ Port, web_ext_PortMulti, ] = (await Promise.all([ require.async('node_modules/multiport/'), require.async('./multiplex'), ]));
			if (!(await self.connect({ name, wait, content: false, }))) { return null; }
			return new Port({ port: self.port, thisArg: self.arg, channel: name, }, web_ext_PortMulti);
		},
	}); } return this.arg; }

	destroy(unload) {
		global.removeEventListener('unload', this.destroy);
		const frames = tabs.get(this.tabId);
		frames && frames.get(this.frameId) === this.promise && frames.delete(this.frameId); frames && frames.size === 0 && tabs.delete(this.tabId);
		this.scripts.forEach(script => script.fireUnload && script.fireUnload([ this.eventArg, ])); this.scripts.clear();
		this.fireUnload && this.fireUnload(unload ? null : [ this.eventArg, ], { last: true, });
		this.port && this.port.onDisconnect.removeListener(this.destroy);
		this.port && this.port.disconnect();
		this.port && delete this.port.frame && delete this.port;
	}
}

async function onConnect(port) {
	if (port.name !== 'require.scriptLoader') { return; }
	if (!port.sender.tab) { port.sender.tab = { id: Math.random(), }; } // happens sometimes in fennec 55. This will also break incognito handling
	const { id: tabId, } = port.sender.tab;
	const { frameId = 0, } = port.sender;
	port.requests = new Map/*<random, [ resolve, reject, ]>*/;
	port.onMessage.addListener(onMessage.bind(null, port));

	const pending = tabs.has(tabId) && tabs.get(tabId).get(frameId) || null;
	if (!pending || !pending.setPort) { console.error(`Unexpected port connection for tab`, tabId, 'frame', frameId); } // if onDisconnect gets fired correctly, this can't happen
	else { pending.setPort(port); delete pending.setPort; }
}

async function onMessage(port, [ method, id, args, ]) {
	if (method.includes('$')) { return; } // for multiplexed Port
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
	async loadScript(url) {
		if (!url.startsWith(rootUrl)) { throw { message: 'Can only load local resources', }; }
		const file = url.slice(rootUrl.length - 1);
		if (FS.exists(file)) { return void (await Tabs.executeScript(this.sender.tab.id, {
			file, frameId: this.sender.frameId, matchAboutBlank: true, runAt: 'document_start',
		})); }

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
			return void (await Tabs.executeScript(this.sender.tab.id, {
				code, frameId: this.sender.frameId, matchAboutBlank: true, runAt: 'document_start',
			}));
		}
		throw { message: `Could not find file "${ file }"`, };
	},
	ping() {
		return true;
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
	connect(name, { wait, }) {
		return this.frame.connect({ name, wait, content: true, });
	},
};

function isScripable(url) {
	return url && (/^(?:https?|file|ftp|app):\/\//).test(url) && (!gecko || !url.startsWith('https://addons.mozilla.org'));
}

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

function deprecate(name, alt) { return function deprecated() {
	console.warn(new Error(`"${ name }" is deprecated, use "${ alt.name }" instead`));
	return alt.apply(this, arguments); // eslint-disable-line no-invalid-this
}; }

{
	runtime.onConnect.addListener(onConnect);
}

return Object.freeze({
	ContentScript,
	runInTab: deprecate('runInTab', runInFrame),
	requireInTab: deprecate('requireInTab', requireInFrame),
	detachFormTab: deprecate('detachFormTab', unloadFrame),
	runInFrame,
	requireInFrame,
	unloadFrame,
	getFrame,
	register,
	set debug(v) { v = !!v; if (debug === v) { return; } debug = v; setOptions({ d: v ? 1 : 0, }); }, get debug() { return debug; },
});

}); })(this); // eslint-disable-line no-invalid-this
