(function(global) { 'use strict'; const queue = [ ]; global.initView = view => queue.push(view); define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../browser/': { extension, manifest, },
	'../utils/': { reportError, },
	'../utils/files': FS,
	require,
}) => {

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
};

function defaultError(view, options, name) {
	const code = (/^[45]\d\d/).test(name) && name;
	view.document.body.innerHTML = `<h1>${ code || 404 }</h1>`;
	!code && console.error(`Got unknown view "${ view.location.hash.slice(1) }"`);
}

const handlers = { }, pending = { };

async function initView(view) { try {
	let [ name, query, ] = view.location.hash.slice(1).split('?');
	name === 'index' && (name = '');
	const options = query ? parseQuery(query) : { };

	const getId = new Promise(got => (view.browser || view.chrome).tabs.getCurrent(tab => got(tab && (view.tabId = tab.id))));

	const handler = handlers[name];
	if (handler) {
		(await null); // let the DOM finish
		(await handler(view, options, name));
	}

	const tabId = (await getId);
	if (pending[tabId]) {
		pending[tabId](view);
		delete pending[tabId];
	} else if (!handler) {
		(await (handlers['404'] || defaultError)(view, options, name));
	}

} catch (error) { (await reportError(`Failed to display page "${ name }"`, error)); console.error(error); } }

if (
	manifest.options_ui && (/^(?:(?:chrome|moz|ms)-extension:\/\/.*?)?\/?view.html#options(?:\ß|$)/).test(manifest.options_ui.page)
	&& (await FS.exists('node_modules/web-ext-utils/options/editor/inline.js'))
) {
	methods.setHandler('options', (await require.async('node_modules/web-ext-utils/options/editor/inline')));
}

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

function loadFrame(path, view) {
	const frame = global.document.createElement('iframe');
	frame.src = '/'+ path;
	frame.style.border = 'none';
	// frame.style.position = 'fixed';
	frame.style.margin = 0;
	frame.style.top    = frame.style.left  = '0';
	frame.style.height = frame.style.width = '100%';
	view.document.body.appendChild(frame);
	frame.addEventListener('load', () => (view.document.title = frame.contentDocument.title), { once: true, });
}

(async () => {
	for (let i = 0; i < 10; i++) { (await null); } // give view modules that depend on this module some ticks time to work with it
	global.initView = initView;
	extension.getViews().forEach(view => view !== global && !queue.includes(view) && view.location.reload()); // reload old views
	queue.forEach(initView);
	queue.splice(0, Infinity);
})();

return methods;

function parseQuery(query) {
	const search = new global.URLSearchParams(query.replace(/[?#]+/, '&')), config = { };
	for (const [ key, value, ] of search) {
		try { config[key] = JSON.parse(value); } catch(_) { config[key] = value; }
	}
	return config;
}

}); })(this);
