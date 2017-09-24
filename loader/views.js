(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../browser/': { extension, manifest, rootUrl, Windows, Tabs, },
	'../browser/version': { fennec, opera, chrome, },
	'../utils/': { reportError, },
	'../utils/files': FS,
	'../utils/event': { setEvent, setEventGetter, },
	module,
	require,
}) => {
const Self = new WeakMap;

const methods = {
	setHandler(name, handler) {
		if (!handler) { handler = name; name = handler.name; }
		if (typeof handler !== 'function' || (name === '' && arguments.length < 2) || typeof name !== 'string')
		{ throw new TypeError(`Signature must be setHandler(name? : string, handler : function)`); }
		handlers[name] = handler;
	},
	removeHandler(name) {
		delete handlers[name];
	},
	getHandler(name) {
		return handlers[name];
	},
	getUrl({ name, query, hash, }) {
		return viewPath + (name || '') + (query ? query.replace(/^\??/, '?') : '') + (hash ? hash.replace(/^\#?/, '#') : '');
	},
	getViews() { return Array.from(locations, _=>_.public); },

	/**
	 * Opens or shows a specific extension view in a tab or popup window.
	 * If the view matches a handler, the handler is run before the view is returned.
	 * Does not run the 404 handler if no handler is matched.
	 * @param  {String}                location                Name/Location of the view to show. Can be the name as a string,
	 *                                                         the argument to or the return value of .getUrl() or the value of a Location#href .
	 * @param  {string|null}           type                    The type of view to open/show. Can be 'tab', 'popup' or null, to give no preference.
	 * @param  {boolean|function}      options.useExisting     Optional. If falsy, a new view will be opened. Otherwise, an existing view may be used and returned if
	 *                                                         .useExisting is a function and returns true for its Location or if the name part of `location` and ` type` match. Defaults to true.
	 * @param  {Boolean}               options.focused         Optional. Whether the window of the returned view should be focused. Defaults to true.
	 * @param  {Boolean}               options.active          Optional. Whether the tab of the returned view should be active within its window. Defaults to true.
	 * @param  {String}                options.state           Optional. The state of the new window, if one is created. Defaults to 'normal'.
	 * @param  {[type]}                options.windowId        Optional. The window in which a new tab gets placed, if one is created.
	 *                                                         Should not be a private window. If it is, the view will be move to a normal window.
	 * @param  {Boolean}               options.pinned          Optional. Whether the tab, if one is created, will be pinned. Defaults to false.
	 * @param  {integer}               options.openerTabId     Optional. The opener tab of the new tab, of one needs to be created.
	 * @param  {natural}               options.index           Optional. The position of the new tab, of one needs to be created.
	 * @param  {integer}               options.width/height    Optional. The dimensions of the popup, if one is created.
	 * @param  {integer}               options.left/top        Optional. The position of the popup, if one is created.
	 * @return {Location}                                      The Location object corresponding to the new or old matching view.
	 */
	async openView(location = '#', type = null, {
		useExisting = true, focused = true, active = true, state = 'normal',
		windowId = undefined, pinned = false, openerTabId = undefined, index = undefined,
		width, height, left, top,
	} = { }) {
		if (typeof location === 'string') {
			if (!(location.startsWith(viewPath) || location === viewPath.slice(-1))) { location = viewPath + location.replace(/^#/, ''); }
		} else {
			location = methods.getUrl(location);
		}
		!Windows && (type = 'tab');
		if (useExisting) {
			const open = methods.getViews().find(
				typeof useExisting === 'function' ? useExisting
				: (name => (_=>_.name === name && (!type || _.type === type)))(location.slice(viewPath.length).replace(/#.*/, ''))
			);
			if (open) {
				(focused || active) && (await Promise.all([
					focused && open.windowId !== WINDOW_ID_NONE && Windows && Windows.update(open.windowId, { focused: true, }),
					active && open.tabId !== TAB_ID_NONE && Tabs.update(open.tabId, { active: true, }),
				]));
				return open;
			}
		}
		const tab = type === 'popup'
		? (await Windows.create({ type: 'popup', url: location, focused, state, width, height, left, top, })).tabs[0]
		: (await Tabs.create({ url: location, active, pinned, windowId, openerTabId, index, }));
		type !== 'popup' && focused && windowId && Windows && Windows.update(windowId, { focused: true, });
		return new Promise((resolve, reject) => (pending[tab.id] = { resolve, reject, }));
	},
	__initView__: initView, // for internal use only
};
const fireOpen  = setEvent(methods, 'onOpen', { lazy: false, });
const fireClose = setEvent(methods, 'onClose', { lazy: false, });
Object.freeze(methods);

// location format: #name?query#hash #?query#hash #name#hash ##hash #name?query!query #?query!query #name!hash #!hash
// view types: 'tab', 'popup', 'panel', 'sidebar', 'frame'
class Location {
	get view     () { return Self.get(this).view; }
	get type     () { return Self.get(this).type; }
	get tabId    () { return Self.get(this).tabId; }
	get windowId () { return Self.get(this).windowId; }
	get activeTab() { return Self.get(this).activeTab; }
	get href     () { return Self.get(this).get({ }); } set href  (v) { const self = Self.get(this); self.href  !== v && self.replace({ href:  v, }, true); }
	get name     () { return Self.get(this).name; }     set name  (v) { const self = Self.get(this); self.name  !== v && self.replace({ name:  v, }, true); }
	get query    () { return Self.get(this).query; }    set query (v) { const self = Self.get(this); self.query !== v && self.replace({ query: v, }, true); }
	get hash     () { return Self.get(this).hash; }     set hash  (v) { const self = Self.get(this); self.hash  !== v ?  self.replace({ hash:  v, }, true) : self.updateHash(); }
	assign(v)  { Self.get(this).replace({ href:  v, }, true); }
	replace(v) { Self.get(this).replace({ href:  v, }, false); }
}
setEventGetter(Location, 'change', Self);
setEventGetter(Location, 'nameChange', Self);
setEventGetter(Location, 'queryChange', Self);
setEventGetter(Location, 'hashChange', Self);

//////// start of private implementation ////////

class LocationP {
	constructor(view, { type = 'tab', href = view.location.hash, tabId, activeTab, windowId, }) {
		Self.set(this.public = new Location, this);
		this.view = view; this.type = type; this.tabId = tabId; this.tabId = tabId; this.windowId = windowId; this.activeTab = activeTab;
		const { name, query, hash, } = LocationP.parse(href || '#');
		this.name = name; this.query = query; this.hash = hash;
		view.addEventListener('hashchange', this);
		view.addEventListener('unload', () => this.destroy());
		locations.add(this);
	}
	get({ name = this.name, query = this.query, hash = this.hash, }) {
		return viewPath + (name || '') + (query ? query.replace(/^\??/, '?') : '') + (hash ? hash.replace(/^\#?/, '#') : '');
	}
	replace({ name = this.name, query = this.query, hash = this.hash, href = this.get({ name, query, hash, }), }, push = false) {
		// Object.assign(this, LocationP.parse(href || '#'));
		this.view.location[push ? 'assign' : 'replace'](href);
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
	destroy() {
		this.fireChange      && this.fireChange      (null, { last: true, });
		this.fireNameChange  && this.fireNameChange  (null, { last: true, });
		this.fireQueryChange && this.fireQueryChange (null, { last: true, });
		this.fireHashChange  && this.fireHashChange  (null, { last: true, });
		fireClose([ this.public, ]);
		Self.delete(this.public); locations.delete(this);
		this.public = this.view = null;
	}

	static parse(url) {
		const string = typeof url === 'string' ? url.startsWith('#') ? url : new global.URL(url, rootUrl).hash : url.hash;
		const [ , name, query, hash, ] = string.match(/^[#]?(.*?)(?:(?:[#!]|[?]([^#\s]*)#?)(.*))?$/);
		return { name, query: query || '', hash: hash || '', };
	}
}

function defaultError(view, location) {
	const code = (/^[45]\d\d$/).test(location.name) ? +location.name : 0;
	view.document.body['inner'+'HTML'] = `
		<style> :root { background: #424F5A; filter: invert(1) hue-rotate(180deg); font-family: Segoe UI, Tahoma, sans-serif; } </style>
		<h1 id="code">${ +code || 404 }</h1><span id="message"></span>
	`; // this is a literal string with a number substituted
	view.document.querySelector('#message').textContent = code ? view.history.state && view.history.state.message || '' : `Unknown view "${ location.name }"`;
	!code && console.error(`Got unknown view "${ view.location.hash.slice(1) }"`);
	location.onChange(() => view.location.reload());
}

const handlers = { }, pending = { }, locations = new Set;
const viewPath = rootUrl +'view.html#';
const { TAB_ID_NONE = -1, } = Tabs, { WINDOW_ID_NONE = -1, } = Windows || { };

async function initView(view, options = { }) { try {
	view.document.querySelector('link[rel="icon"]').href = (manifest.icons[1] || manifest.icons[64]).replace(/^\/?/, '/'); makeEdgeSuckLess(view);
	options = parseSearch(options);

	const get = what => new Promise(got => (view.browser || view.chrome)[what +'s'].getCurrent(got));

	let type = 'other', tabId = TAB_ID_NONE, windowId = WINDOW_ID_NONE, activeTab = TAB_ID_NONE, resize;
	if (options.emulatePanel) {
		({ windowId, } = (await get('tab')));
		'originalActiveTab' in options && (activeTab = options.originalActiveTab);
		type = 'panel';

		view.addEventListener('blur', () => Windows.remove(windowId));
		resize = view.resize = (width, height) => { const rect = view.document.scrollingElement.getBoundingClientRect();
			Windows.update(windowId, { width: (width || rect.width) + 14 |0, height: (height || rect.height) + 42 |0, }); // provide a function for the view to resize itself.
		};
		(await Windows.update(windowId, { top: options.top, left: options.left, })); // firefox currently ignores top and left in .create(), so move it here
	} else if (fennec) {
		const tab = (await get('tab')); tabId = tab.id; type = 'tab';
		view.innerWidth < tab.width && (type = 'frame');
	} else {
		const [ tab, window, ] = (await Promise.all([ get('tab'), get('window'), ]));
		if (tab) {
			tabId = tab.id; windowId = tab.windowId; type = window && [ 'popup', 'panel', ].includes(window.type) ? 'popup' : 'tab'; // window is (sometimes?) undefined in edge
			view.innerWidth < tab.width && (type = 'frame');
		} else {
			windowId = window.id;
			const body = view.document.body; type =
			  opera && body.clientWidth === 0 ? 'sidebar'
			: chrome && body.clientWidth > 100 && body.clientHeight === 0 ? 'frame'
			: body.clientWidth < 15 ? 'panel' : 'sidebar';
		}
	}
	// TODO: in firefox panels don't have focus for (all?) keyboard input before the user clicks in them. It would be nice if the focus could be forced to the panel
	const location = new LocationP(view, { type, tabId, windowId, activeTab, });

	let handler = handlers[location.name];
	handler && (await handler(view, location.public));

	'originalTab' in options && (tabId = options.originalTab);
	if (tabId !== TAB_ID_NONE && pending[tabId]) {
		pending[tabId].resolve(location.public);
		delete pending[tabId];
	} else if (!handler) {
		handler = handlers['404'] || defaultError;
		(await handler(view, location.public));
	}

	location.updateHash(); resize && resize();

	fireOpen([ location.public, ]);

} catch (error) {
	const tabId = options.originalTab || view.tabId; if (tabId != null && pending[tabId]) { pending[tabId].reject(error); delete pending[tabId]; }
	else { (await reportError(`Failed to display page "${ view.location.hash }"`, error)); }
} }

if ((await FS.exists('views'))) { for (const name of (await FS.readdir('views'))) {
	const path = FS.resolve('views', name);
	const isFile = (await FS.stat(path)).isFile();
	const handler = isFile
	? (
		  name.endsWith('.html')
		? loadFrame.bind(null, path)
		: name.endsWith('.js')
		? (...args) => require.async(path.slice(0, -3)).then(_=>_(...args))
		: null
	) : (
		  (await FS.exists(path +'/index.html'))
		? loadFrame.bind(null, path +'/index.html')
		: (await FS.exists(path +'/index.js'))
		? (...args) => require.async(path +'/').then(_=>_(...args))
		: null
	);
	if (handler) {
		methods.setHandler(isFile ? name.replace(/\.(?:html|js)$/, '') : name, handler);
		(isFile ? (/^index\.(?:html|js)$/) : (/^index$/)).test(name) && methods.setHandler('', handler);
	}
} }

if (
	!handlers.options && manifest.options_ui && (/^(?:(?:chrome|moz|ms)-extension:\/\/.*?)?\/?view.html#options(?:\?|$)/).test(manifest.options_ui.page)
	&& (await FS.exists('node_modules/web-ext-utils/options/editor/inline.js'))
) {
	const options = (await require.async('node_modules/web-ext-utils/options/editor/inline'));
	methods.setHandler('options', options);
	!handlers[''] && methods.setHandler('', options);
}

function loadFrame(path, view) {
	const frame = global.document.createElement('iframe');
	frame.src = '/'+ path;
	frame.style.border = 'none';
	frame.style.margin = 0;
	frame.style.top    = frame.style.left  = '0';
	frame.style.height = frame.style.width = '100%';
	view.document.body.tagName === 'BODY' && (frame.style.position = 'fixed');
	view.document.body.appendChild(frame);
	frame.addEventListener('load', () => (view.document.title = frame.contentDocument.title), { once: true, });
}

(async () => {
	(await module.ready); (await null);
	const knownViews = new Set(Array.from(locations, _=>_.view));
	extension.getViews().forEach(view => view !== global && !knownViews.has(view) && view.location.reload()); // reload old views
})();

return methods;

function parseSearch(search) {
	const config = { };
	for (let [ key, value, ] of Object.entries(search)) {
		try { value = decodeURIComponent(value); } catch(_) { }
		try { config[key] = JSON.parse(value); } catch(_) { config[key] = value; }
	}
	return config;
}

function makeEdgeSuckLess(window) {
	window.NodeList.prototype.forEach = window.Array.prototype.forEach;
}

}); })(this);
