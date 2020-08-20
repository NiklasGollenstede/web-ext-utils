(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../browser/': { manifest, rootUrl, Windows, Tabs, Sessions, },
	'../browser/version': { gecko, fennec, opera, chrome, },
	'../utils/notify': notify,
	'../utils/files': FS,
	'../utils/event': { setEvent, setEventGetter, },
	require,
	'fetch!package.json:json': packageJson,
	'lazy!fetch!./_view.js': _2,
}) => {
const Self = new WeakMap;

/**
 * Central manager for all extension views (tabs, popups, panels, sidebars).
 * The central idea behind this module is that all views are managed and populated by the background script.
 * Compared with traditional extension pages, where each page has its own HTML file that loads a bunch of
 * styles and scripts that rely on messaging to communicate with the background page,
 * this allows for a number of performance and usability advantages:
 *  * the location of the HTML file is not exposed in the URL bar. It only shows a customizable string (e.g. the extension name) and the name of the current view
 *  * views don't need to load any JS files when they load, since all modules are (lazily) loaded in the background page
 *  * there is no need for asynchronous messaging at all, since the background scripts modules are directly accessible
 *  * this makes it a lot easier to keep things fast and in sync
 *  * error handling can be done in one central place
 *
 * The only drawback is that, in Firefox, views can't be opened in private windows or container tabs,
 * but these situations are automatically detected and handled as gracefully as possible.
 *
 * ## Dependencies
 *
 * This module relies on the `../utils/files` module, which requires the `/files.json` to be built,
 * and a copy of the `./_view.html` file in the extension root. `web-ext-build` takes care of both
 * and also lets you choose a custom name to display in the URL bar, which for Firefox, doesn't
 * even require the `.html` extension.
 *
 * ## Usage
 *
 * The basic usage is pretty simple. Just create JS or HTML files in the `/views/` directory of your extension
 * and rebuild (s.o.). This script will automatically and lazily load the modules and make then available
 * as `browser.runtime.getUrl('<chosen_root>#<name>')` from the following paths:
 *  * `/views/<name>.{js|html}`
 *  * `/views/<name>/index.{js|html}`
 * HTML files should only be used for static information. They will be framed to hide the URL,
 * but are otherwise loaded without modifications.
 * JS files matching one of the above patterns must be AMD modules that export a function `(view, location)`.
 * When a view with a matching `name` is opened, the corresponding module will be loaded with the `window`
 * object and the views `location` (see below).
 *
 * Apart from that, this module provides APIs to get open views and open different types of views,
 * programmatically register named views, generate URLs, and handle redirects and errors.
 */

const exports = {
	/**
	 * Shows or opens a specific extension view in a tab or popup window.
	 * If the view matches a handler, the handler is run before the view is returned.
	 * Does not run the 404 handler if no handler is matched.
	 * @param  {string|null}        location              Name/Location of the view to show. Can be the name as a string,
	 *                                                    the argument to, or the return value of, `.getUrl()` or the value of a `Location#href` .
	 * @param  {string|null}        type                  The type of view to open/show. Can be 'tab', 'popup', 'panel' or null, to give no preference (which opens as tabs).
	 * @param  {boolean|function?}  options.useExisting   Optional. If falsy, a new view will be opened. Otherwise, an existing view may be used and returned if:
	 *                                                    * `.useExisting` is a function and returns `true`isch for its `Location`
	 *                                                    * or if the name part of `location` and ` type` match.
	 *                                                    Defaults to `false` for `openView` and `true` for `showView`.
	 * @param  {Boolean?}           options.focused       Optional. Whether the window of the returned view should be focused. Defaults to `true`.
	 * @param  {Boolean?}           options.active        Optional. Whether the tab of the returned view should be active within its window. Defaults to `true`.
	 * @param  {String?}            options.state         Optional. The state of the new window, if one is created. Defaults to `'normal'`.
	 * @param  {natural?}           options.windowId      Optional. The window in which a new tab gets placed, if one is created.
	 *                                                    Should not be a private window. If it is, the view will be moved to a normal window.
	 * @param  {Boolean?}           options.pinned        Optional. Whether the tab, if one is created, will be pinned. Defaults to `false`.
	 * @param  {integer?}           options.openerTabId   Optional. The opener tab of the new tab, of one needs to be created.
	 * @param  {natural?}           options.index         Optional. The position of the new tab, of one needs to be created.
	 * @param  {integer?}           options.width/height  Optional. The dimensions of the popup, if one is created.
	 * @param  {integer?}           options.left/top      Optional. The position of the popup, if one is created.
	 * @return {Location}                                 The `Location` object corresponding to the new or matching exiting view.
	 */
	async openView(location, type, options) { return openView(location, type, options && ('useExisting' in options) ? options.useExisting : false, options); },
	async showView(location, type, options) { return openView(location, type, options && ('useExisting' in options) ? options.useExisting : true, options); },

	/**
	 * Registers the handler function for a named view.
	 * Replaces if the name is already (implicitly) registered.
	 * @param {string?}   name     Optional. Name of the view to register. May be `''` to register a default view. Defaults to `handler.name` if `handler` is a named function.
	 * @param {function}  handler  (Async) Function `(Window, Location)` called whenever a view with that `name` loads.
	 */
	setHandler(name, handler) {
		if (typeof name === 'function' && name.name) { handler = name; name = handler.name; }
		else if (typeof name !== 'string' || typeof handler !== 'function')
		{ throw new TypeError(`setHandler must be called with a named function or a name and a function`); }
		handlers[name] = handler;
	},
	/// Unregisters the handler for a given `name`, if one is set.
	removeHandler(name) { delete handlers[name]; },
	/// Returns the handler for a given `name`, if one is set.
	getHandler(name) { return handlers[name]; },

	/// Returns the extension instance specific, absolute, normalized URL to a view.
	getUrl({ name, query, hash, }) {
		return viewPath
		+ (name  ? (name +'')  .replace(/^[#]/, '') : '')
		+ (query ? (query +'') .replace(/^[?]?/, '?') : '')
		+ (hash  ? (hash +'')  .replace(/^[#]?/, '#') : '');
	},
	/// @return {[Location]}  New array with all open views' `Location`s.
	getViews() { return Array.from(locations.values(), _=>_.public); },
	/// Given the global `window` of a view, returns its `Location`.
	locationFor(view) { const location = locations.get(view); return location ? location.public : null; },
	/// Creates a view handler that can be registered under any name to redirect to the given `target` name.
	createRedirect(target) { return (view, location) => {
		location.replace(target); return (handlers[target] || handlers['404'] || defaultError)(view, location);
	}; },
	async getCustomElements() { return getCustomElements(); },
};
/// `Event` that fires with `(Location)` whenever a view was opened/loaded.
const fireOpen  = setEvent(exports, 'onOpen', { lazy: false, });
/// `Event` that fires with the old `(Location)` whenever a view was closed/unloaded.
const fireClose = setEvent(exports, 'onClose', { lazy: false, });

// location format: #name?query#hash #?query#hash #name#hash ##hash #name?query!query #?query!query #name!hash #!hash
// view types: 'tab', 'popup', 'panel', 'sidebar', 'frame'
class Location {
	get view     () { return (Self.get(this) || { }).view; }
	get type     () { return Self.get(this).type; }
	get tabId    () { return Self.get(this).tabId; }
	get windowId () { return Self.get(this).windowId; }
	get activeTab() { return Self.get(this).activeTab; }
	get href     () { return exports.getUrl(Self.get(this)); } toString() { return this.href; }
	get name     () { return Self.get(this).name; }
	get query    () { return Self.get(this).query; }
	get hash     () { return Self.get(this).hash; }
	assign      (v) { v = LocationP.normalize(v);  const self = Self.get(this); self.navigate({ href:  v, }, self.href  !== v); }
	replace     (v) { v = LocationP.normalize(v);  const self = Self.get(this); self.navigate({ href:  v, }, false); }
	set href    (v) { v = LocationP.normalize(v);  const self = Self.get(this); self.navigate({ href:  v, }, self.href  !== v); }
	set name    (v) { v += '';                     const self = Self.get(this); self.navigate({ name:  v, }, self.name  !== v); }
	set query   (v) { v += '';                     const self = Self.get(this); self.navigate({ query: v, }, self.query !== v); }
	set hash    (v) { v += ''; const self = Self.get(this); self.hash  !== v ?  self.navigate({ hash:  v, }, true) : self.updateHash(); }
}
setEventGetter(Location, 'change', Self);
setEventGetter(Location, 'nameChange', Self);
setEventGetter(Location, 'queryChange', Self);
setEventGetter(Location, 'hashChange', Self);

// default error handler
function defaultError(view, location) {
	const code = (/^[45]\d\d$/).test(location.name) ? +location.name : 0;
	view.document.body['inner'+'HTML'] = `<h1 id="code"></h1><span id="message"></span>`
	+`<style> :root { background: #424F5A; filter: invert(1) hue-rotate(180deg); font-family: Segoe UI, Tahoma, sans-serif; } </style>`;
	view.document.querySelector('#message').textContent = code ? view.history.state && view.history.state.message || '' : `Unknown view "${ location.name }"`;
	view.document.querySelector('#code').textContent = code || 404;
	view.document.title = !code || code === 404 ? 'Not Found' : view.history.state && view.history.state.title || 'Error';
	!code && console.error(`Got unknown view "${ view.location.hash.slice(1) }"`);
	location.onChange(() => view.location.reload());
}

//////// start of private implementation ////////

Object.defineProperty(exports, '__initView__', { value: initView, });
Object.freeze(exports);

const handlers = { __proto__: null, }, pending = { __proto__: null, }, locations = new Map;
const viewName = (packageJson.config && packageJson.config['web-ext-utils'] && packageJson.config['web-ext-utils'].viewName || packageJson.name) + (gecko ? '' : '.html');
const viewPath = rootUrl + viewName +'#';
const { TAB_ID_NONE = -1, } = Tabs, { WINDOW_ID_NONE = -1, } = Windows || { };

class LocationP {
	constructor(view, { type = 'tab', href = view.location.hash, tabId, activeTab, windowId, }) {
		Self.set(this.public = new Location, this);
		this.view = view; this.type = type; this.tabId = tabId; this.windowId = windowId; this.activeTab = activeTab;
		const { name, query, hash, } = LocationP.parse(href || '#');
		this.name = name; this.query = query; this.hash = hash;
		view.addEventListener('hashchange', this);
		view.addEventListener('unload', () => this.destroy());
		type === 'tab' && windowId !== WINDOW_ID_NONE && Tabs.onAttached.addListener(this.updateWindow = this.updateWindow.bind(this));
		locations.set(view, this);
	}
	getUrl(props) { // called with { href, name, query, hash, } as optional strings
		if (('href' in props)) { return LocationP.normalize(props.href); }
		if (('hash' in props) && !('query' in props)) { props.query = this.query; }
		if (('query' in props) && !('name' in props)) { props.name = this.name; }
		return exports.getUrl(props);
	}
	navigate(target, push = false) {
		const url = this.getUrl(target);
		!push && Object.assign(this, LocationP.parse(url));
		this.view.location[push ? 'assign' : 'replace'](url);
	}
	updateHash() {
		const target = this.hash ? this.view.document.getElementById(this.hash) : null;
		target && target.scrollIntoView();
		this.view.document.querySelectorAll('.-pseudo-target').forEach(node => node !== target && node.classList.remove('-pseudo-target'));
		target && target.classList.add('-pseudo-target');
	}
	handleEvent(event) { // hashchange; reload if name changes to a different handler or the error handler
		const { name, query, hash, } = this; Object.assign(this, LocationP.parse(this.view.location.hash || '#'));
		if (handlers[name] !== handlers[this.name]) { event.stopImmediatePropagation(); this.view.location.reload(); return; }
		this.fireChange  && this.fireChange([ this.view.location.hash, new global.URL(event.oldURL).hash, this.view, ]);
		if (name  !== this.name)  { this.fireNameChange  && this.fireNameChange  ([ this.name,  name,  this.view, ]); }
		if (query !== this.query) { this.fireQueryChange && this.fireQueryChange ([ this.query, query, this.view, ]); }
		if (hash  !== this.hash)  { this.fireHashChange  && this.fireHashChange  ([ this.hash,  hash,  this.view, ]); }
		this.updateHash();
	}
	updateWindow(id, { newWindowId, }) { this.windowId = newWindowId; }
	destroy() {
		this.fireChange      && this.fireChange      (null, { last: true, });
		this.fireNameChange  && this.fireNameChange  (null, { last: true, });
		this.fireQueryChange && this.fireQueryChange (null, { last: true, });
		this.fireHashChange  && this.fireHashChange  (null, { last: true, });
		fireClose([ this.public, ]);
		Self.delete(this.public); locations.delete(this.view);
		this.type === 'tab' && Tabs.onAttached.removeListener(this.updateWindow);
		this.public = this.view = null;
	}

	static parse(url) {
		const string = typeof url === 'string' ? url.startsWith('#') ? url : new global.URL(url, rootUrl).hash : url.hash;
		const [ , name, query, hash, ] = string.match(/^[#]?(.*?)(?:(?:[#!]|[?]([^#\s]*)#?)(.*))?$/);
		return { name, query: query || '', hash: hash || '', };
	}
	static normalize(href) { href += '';
		if (href.startsWith(viewPath) || href === viewPath.slice(-1)) { return href; }
		return viewPath + href.replace(/^#/, '');
	}
}

async function openView(location, type, useExisting, {
	focused = true, active = true, state = 'normal',
	windowId = undefined, pinned = false, openerTabId = undefined, index = undefined,
	width, height, left, top,
} = { }) {
	location = typeof location === 'string' ? LocationP.normalize(location)
	: typeof location === 'object' ? exports.getUrl(location || { }) : viewPath;
	!Windows && (type = 'tab');
	if (useExisting) {
		const open = exports.getViews().find(
			typeof useExisting === 'function' ? loc => useExisting(loc)
			: (name => (_=>_.name === name && (!type || _.type === type)))(location.slice(viewPath.length).replace(/#.*/, ''))
		); if (open) { (focused || active) && (await Promise.all([
			focused && open.windowId !== WINDOW_ID_NONE && Windows && Windows.update(open.windowId, { focused: true, }),
			active && open.tabId !== TAB_ID_NONE && Tabs.update(open.tabId, { active: true, }),
		])); return open; }
	}
	if (type === 'panel') { location = location.replace('#', '?emulatePanel=true#'); type = 'popup'; }
	const tab = type === 'popup'
	? (await Windows.create({ type: 'popup', url: location, focused, state, width, height, left, top, })).tabs[0]
	: (await Tabs.create({ url: location, active, pinned, windowId, openerTabId, index, }));
	type !== 'popup' && focused && windowId && Windows && Windows.update(windowId, { focused: true, });
	return new Promise((resolve, reject) => (pending[tab.id] = { resolve, reject, }));
}

/**
 * Called by the initialization script of each view directly after it loads.
 * Builds the views `Location` and calls its handler and/or returns it to its creator.
 * @param  {Window}  view     The views global `window` global variable.
 * @param  {object}  options  Partially parsed URL query parameters. The keys and values are still undecoded strings.
 */
async function initView(view, options = { }) { try { options = parseSearch(options);
	view.location.pathname !== viewName && view.history.replaceState(
		view.history.state, view.document.title,
		Object.assign(new view.URL(view.location), { pathname: viewName, }),
	);
	view.document.querySelector('link[rel="icon"]').href = (manifest.icons[1] || manifest.icons[64]).replace(/^\/?(?!.*:\/\/)/, '/');
	makeEdgeSuckLess(view); const gettingCustomElements = getCustomElements();

	const get = what => new Promise(got => (view.browser || view.chrome)[what +'s'].getCurrent(got));

	let tab, window, type = 'other', tabId = TAB_ID_NONE, windowId = WINDOW_ID_NONE, activeTab = TAB_ID_NONE, resize;
	if (fennec) {
		tab = (await get('tab')); tabId = tab.id; type = 'tab';
		view.innerHeight < tab.height * .75 && (type = 'frame'); // TODO: this test is dumb
		type === 'frame' && (view.document.body.style.minHeight = Math.floor(tab.height * .75) +'px'); // maybe this helps to make the tiny inline options view in fennec (68) larger, allowing to move the options back there
	} else {
		[ tab, window, ] = (await Promise.all([ get('tab'), get('window'), ]));
		if (tab) {
			tabId = tab.id; windowId = tab.windowId; type = window && [ 'popup', 'panel', ].includes(window.type) ? 'popup' : 'tab'; // window is (sometimes?) undefined in edge
			view.innerWidth < tab.width && (type = 'frame'); // TODO: this test is dumb
		} else {
			windowId = window.id;
			const body = view.document.body; type =
			  opera && body.clientWidth === 0 ? 'sidebar'
			: chrome && body.clientWidth > 100 && body.clientHeight === 0 ? 'frame'
			: body.clientWidth < 15 ? 'panel' : 'sidebar';
		}
	}
	if (options.emulatePanel && type === 'popup') {
		type = 'panel'; 'originalActiveTab' in options && (activeTab = options.originalActiveTab);

		const hOff = tab && window ? window.height - tab.height : 42, wOff = tab && window ? window.width - tab.width : 42;
		view.addEventListener('blur', () => Windows.remove(windowId));
		resize = view.resize = (width, height) => { const rect = view.document.scrollingElement.getBoundingClientRect();
			Windows.update(windowId, { width: (width || rect.width) + wOff |0, height: (height || rect.height) + hOff |0, }); // provide a function for the view to resize itself.
		};
		(await Windows.update(windowId, { top: options.top, left: options.left, })); // firefox currently ignores top and left in .create(), so move it here
		gecko && windowId && Sessions && Windows.onRemoved.addListener(async function forget(closedId) {
			if (closedId !== windowId) { return; } Windows.onRemoved.removeListener(forget);
			const session = (await Sessions.getRecentlyClosed({ maxResults: 1, }))[0];
			session && session.window && Sessions.forgetClosedWindow(session.window.sessionId);
		});
	}
	// TODO: in firefox panels don't have focus for (all?) keyboard input before the user clicks in them. It would be nice if the focus could be forced to the panel
	const location = new LocationP(view, { type, tabId, windowId, activeTab, });

	for (const { 0: name, 1: getClass, } of Object.entries((await gettingCustomElements))) {
		const Element = getClass(view); if (!Element) { continue; }
		view.customElements.define(name, Element, Element.options);
	}

	const handler = handlers[location.name];
	handler && (await handler(view, location.public));

	'originalTab' in options && (tabId = options.originalTab);
	if (tabId !== TAB_ID_NONE && pending[tabId]) {
		pending[tabId].resolve(location.public);
		delete pending[tabId];
	} else if (!handler) {
		(await (handlers['404'] || defaultError)(view, location.public));
	}

	location.updateHash(); resize && handler && resize();

	fireOpen([ location.public, ]);

} catch (error) {
	const tabId = options.originalTab || view.tabId; if (tabId != null && pending[tabId]) { pending[tabId].reject(error); delete pending[tabId]; }
	else { (await notify.error(`Failed to display page "${ view.location.hash }"`, error)); }
} }

const baseUrl = require.toUrl('/').slice(rootUrl.length);
if (FS.exists(baseUrl +'views')) { includeImplicitViews(baseUrl +'views'); }
function includeImplicitViews(base) { for (let name of FS.readdir(base)) {
	if (name[0] === '.' || name[0] === '_') { continue; }
	const path = base +'/'+ name;
	const isFile = FS.stat(path).isFile();
	const handler = isFile
	? (
		  name.endsWith('.html')
		? FrameLoader(path)
		: name.endsWith('.js')
		? (...args) => require.async(path.slice(0, -3)).then(_=>_(...args))
		: null
	) : (
		  FS.exists(path +'/index.html')
		? FrameLoader(path +'/index.html')
		: FS.exists(path +'/index.js')
		? (...args) => require.async(path +'/').then(_=>_(...args))
		: null
	);
	if (handler) {
		isFile && (name = name.replace(/\.(?:html|js)$/, '')); if (name === 'index') {
			exports.setHandler('', handler); exports.setHandler('index', exports.createRedirect(''));
		} else { exports.setHandler(name, handler); }
	}
} }

if ( // automatically create inline options view if options view is required but not explicitly defined
	!handlers.options && manifest.options_ui && (
		   manifest.options_ui.page === viewPath +'options' // firefox resolves the url
		|| manifest.options_ui.page === `/${viewName}#options` // chrome doesn't
	) && FS.exists('node_modules/web-ext-utils/options/editor/inline.js')
) {
	exports.setHandler('options', (...args) => require.async('node_modules/web-ext-utils/options/editor/inline').then(_=>_(...args)));
	!handlers[''] && exports.setHandler('', exports.createRedirect('options'));
}

function getCustomElements() { return getCustomElements.called || (getCustomElements.called = (async () => {
	const elements = { __proto__: null, }; if (FS.exists('views/_elements')) { (await Promise.all(FS.readdir('views/_elements').map(async name => {
		if (name[0] === '.' || name[0] === '_' || !name.endsWith('.js')) { return; }
		name = name.slice(0, -3); const path = 'views/_elements/'+ name;
		FS.stat(path +'.js').isFile() && (elements[name] = (await require.async(path)));
	}))); } return elements;
})()); }

function FrameLoader(path) { return function(view) {
	const frame = global.document.createElement('iframe');
	frame.src = '/'+ path;
	frame.style.border = 'none';
	frame.style.margin = 0;
	frame.style.top    = frame.style.left  = '0';
	frame.style.height = frame.style.width = '100%';
	view.document.body.tagName === 'BODY' && (frame.style.position = 'fixed');
	view.document.body.appendChild(frame);
	frame.addEventListener('load', () => (view.document.title = frame.contentDocument.title), { once: true, });
}; }

return exports;

function parseSearch(search) {
	const config = { };
	for (let [ key, value, ] of Object.entries(search)) {
		try { key = decodeURIComponent(key); } catch(_) { }
		try { value = decodeURIComponent(value); } catch(_) { }
		try { config[key] = JSON.parse(value); } catch(_) { config[key] = value; }
	}
	return config;
}

function makeEdgeSuckLess(window) {
	!window.NodeList.prototype.forEach && (window.NodeList.prototype.forEach = window.Array.prototype.forEach);
}

}); })(this);
