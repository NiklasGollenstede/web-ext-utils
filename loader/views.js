(function(global) { 'use strict'; prepare() && define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../browser/': { extension, manifest, rootUrl, Windows, Tabs, },
	'../browser/version': { fennec, },
	'../utils/': { reportError, },
	'../utils/files': FS,
	'../utils/event': { setEventGetter, },
	require,
}) => {
const Self = new WeakMap;

const methods = Object.freeze({
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
	getViews() { return Array.from(locations); },
	async openView(location = '#', type = 'tab', options = { }) {
		if (typeof location === 'string') {
			if (!location.startsWith(viewPath) || location === viewPath.slice(-1)) { location = viewPath + location.replace(/^#/, ''); }
		} else {
			location = methods.getUrl(location);
		}
		type !== 'popup' || !Windows && (type = 'tab');
		const tab = type === 'popup' ? (await Windows.create({
			type: 'popup', url: location, focused: options.focused !== false, state: options.state || undefined, // drawAttention: !!options.drawAttention,
			width: options.width || undefined, height: options.height || undefined, left: options.left || undefined, top: options.top || undefined,
		})).tabs[0] : (await Tabs.create({
			url: location, active: options.active !== false, pinned: options.pinned || false, windowId: options.windowId || undefined,
			openerTabId: 'openerTabId' in options ? options.openerTabId : undefined, index: options.index || undefined,
		}));
		return new Promise((resolve, reject) => (pending[tab.id] = { resolve, reject, }));
	},
});

// location format: #name?query#hash #?query#hash #name#hash ##hash #name?query!query #?query!query #name!hash #!hash
// view types: tab, popup, other
class Location {
	get view  () { return Self.get(this).target; }   get type   () { return Self.get(this).type; }
	get tabId () { return Self.get(this).tabId; } get windowId () { return Self.get(this).windowId; } get activeTab() { return Self.get(this).activeTab; }
	get href  () { return Self.get(this).get({ }); } set href  (v) { const self = Self.get(this); self.href  !== v && self.replace({ href:  v, }, true); }
	get name  () { return Self.get(this).name; }     set name  (v) { const self = Self.get(this); self.name  !== v && self.replace({ name:  v, }, true); }
	get query () { return Self.get(this).query; }    set query (v) { const self = Self.get(this); self.query !== v && self.replace({ query: v, }, true); }
	get hash  () { return Self.get(this).hash; }     set hash  (v) { const self = Self.get(this); self.hash  !== v ?  self.replace({ hash:  v, }, true) : self.updateHash(); }
	assign(v)  { Self.get(this).replace({ href:  v, }, true); }
	replace(v) { Self.get(this).replace({ href:  v, }, false); }
}
setEventGetter(Location, 'change', Self);
setEventGetter(Location, 'nameChange', Self);
setEventGetter(Location, 'queryChange', Self);
setEventGetter(Location, 'hashChange', Self);

//////// start of private implementation ////////

class LocationP {
	constructor(target, { type = 'tab', href = target.location.hash, tabId, activeTab, windowId, }) {
		Self.set(this.public = new Location, this);
		this.target = target; this.type = type; this.tabId = tabId; this.tabId = tabId; this.activeTab = activeTab;
		this.windowId = type === 'popup' ? windowId : null;
		const { name, query, hash, } = LocationP.parse(href || '#');
		this.name = name; this.query = query; this.hash = hash;
		target.addEventListener('hashchange', this);
		target.addEventListener('unload', () => this.destroy());
	}
	get({ name = this.name, query = this.query, hash = this.hash, }) {
		return viewPath + (name || '') + (query ? query.replace(/^\??/, '?') : '') + (hash ? hash.replace(/^\#?/, '#') : '');
	}
	replace({ name = this.name, query = this.query, hash = this.hash, href = this.get({ name, query, hash, }), }, push = false) {
		// Object.assign(this, LocationP.parse(href || '#'));
		this.target.location[push ? 'assign' : 'replace'](href);
	}
	updateHash() {
		const target = this.target.document.getElementById(this.hash);
		target && target.scrollIntoView();
		this.target.document.querySelectorAll('.-pseudo-target').forEach(node => node !== target && node.classList.remove('-pseudo-target'));
		target && target.classList.add('-pseudo-target');
	}
	handleEvent(event) { // reload if name changes to a different handler or the error handler
		const { name, query, hash, } = this; Object.assign(this, LocationP.parse(this.target.location.hash || '#'));
		if (handlers[name] !== handlers[this.name]) { event.stopImmediatePropagation(); this.target.location.reload(); return; }
		this.fireChange  && this.fireChange([ this.target.location.hash, new global.URL(event.oldURL).hash, this.target, ]);
		if (name  !== this.name)  { this.fireNameChange  && this.fireNameChange  ([ this.name,  name,  this.target, ]); }
		if (query !== this.query) { this.fireQueryChange && this.fireQueryChange ([ this.query, query, this.target, ]); }
		if (hash  !== this.hash)  { this.fireHashChange  && this.fireHashChange  ([ this.hash,  hash,  this.target, ]); }
		this.updateHash();
	}
	destroy() {
		this.fireChange      && this.fireChange      (null, { last: true, });
		this.fireNameChange  && this.fireNameChange  (null, { last: true, });
		this.fireQueryChange && this.fireQueryChange (null, { last: true, });
		this.fireHashChange  && this.fireHashChange  (null, { last: true, });
		Self.delete(this.public);
	}

	static parse(url) {
		const string = typeof url === 'string' ? url.startsWith('#') ? url : new global.URL(url, rootUrl).hash : url.hash;
		const [ , name, query, hash, ] = string.match(/^[#]?(.*?)(?:(?:[#!]|[?]([^#\s]*)#?)(.*))?$/);
		return { name, query: query || '', hash: hash || '', };
	}
}

function defaultError(view, location) {
	const code = (/^[45]\d\d/).test(location.name) && location.name;
	view.document.body.innerHTML = `<h1>${ code || 404 }</h1>`;
	!code && console.error(`Got unknown view "${ view.location.hash.slice(1) }"`);
	location.onChange(() => view.location.reload());
}

const handlers = { }, pending = { }, locations = new Set;
const viewPath = rootUrl +'view.html#';

async function initView(view, options = new global.URLSearchParams('')) { try {
	view.document.querySelector('link[rel="icon"]').href = (manifest.icons[1] || manifest.icons[64]).replace(/^\/?/, '/');
	options = parseSearch(options);
	let [ tab, window, ] = (await Promise.all([ 'tabs', ...(fennec ? [ ] : ['windows', ]), ].map(type => new Promise(got => (view.browser || view.chrome)[type].getCurrent(got)))));

	if (options.emulatePanel) {
		const { windowId, } = tab; tab = null; tab = view.tabId = null;

		view.addEventListener('blur', event => view.close());
		view.resize = (width = view.document.scrollingElement.scrollWidth, height = view.document.scrollingElement.scrollHeight) => {
			Windows.update(windowId, { width, height, }); // provide a function for the view to resize itself. TODO: should probably add some px as well
		};
		(await Windows.update(windowId, { top: options.top, left: options.left, })); // firefox currently ignores top and left in .create(), so move it here
	}

	const location = new LocationP(view, {
		type: tab ? [ 'popup', 'panel', ].includes(window && window.type) ? 'popup' : 'tab' : 'other',
		tabId: tab && tab.id, activeTab: options.originalActiveTab,
		windowId: window && window.id,
	});
	locations.add(location); view.addEventListener('unload', () => locations.delete(location));

	let handler = handlers[location.name];
	if (handler) {
		(await handler(view, location.public));
	}

	const tabId = options.originalTab || tab && tab.id;
	if (tabId != null && pending[tabId]) {
		pending[tabId].resolve(location.public);
		delete pending[tabId];
	} else if (!handler) {
		handler = handlers['404'] || defaultError;
		(await handler(view, location.public));
	}

	location.updateHash();

} catch (error) {
	const tabId = options.originalTab || view.tabId; if (tabId != null && pending[tabId]) { pending[tabId].reject(error); delete pending[tabId]; }
	else { (await reportError(`Failed to display page "${ view.location.hash }"`, error)); console.error(error); }
} }

if ((await FS.exists('views'))) { for (const name of (await FS.readdir('views'))) {
	const path = FS.resolve('views', name);
	const isFile = (await FS.stat(path)).isFile();
	const handler = isFile
	? (
		  name.endsWith('.html')
		? loadFrame.bind(null, path)
		: name.endsWith('.js')
		? (await require.async(path.slice(0, -3)))
		: null
	) : (
		  (await FS.exists(path +'/index.html'))
		? loadFrame.bind(null, path +'/index.html')
		: (await FS.exists(path +'/index.js'))
		? (await require.async(path +'/'))
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
	for (let i = 0; i < 10; i++) { (await null); } // give view modules that depend on this module some ticks time to work with it
	global.initView = initView;
	extension.getViews().forEach(view => view !== global && !prepare.queue.find(_=>_[0] === view) && view.location.reload()); // reload old views
	prepare.queue.forEach(args => initView(...args));
	prepare.queue.splice(0, Infinity);
})();

return methods;

function parseSearch(search) {
	const config = { };
	for (let [ key, value, ] of search) {
		try { value = decodeURIComponent(value); } catch(_) { }
		try { config[key] = JSON.parse(value); } catch(_) { config[key] = value; }
	}
	return config;
}

}); function prepare() {

// enqueue all views that load before this module is ready
const queue = prepare.queue = [ ]; global.initView = (...args) => queue.push(args);

if (global.innerWidth || global.innerHeight) { // stop loading at once if the background page was opened in a tab or window
	console.warn(`Background page opened in view`);
	global.history.replaceState({ from: global.location.href.slice(global.location.origin.length), }, null, '/view.html#403');
	global.stop(); global.location.reload();
	return false;
} else { return true; }

} })(this);
