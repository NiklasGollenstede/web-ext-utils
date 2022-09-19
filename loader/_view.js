(async function(global) { 'use strict'; try { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
/**
 * This script is loaded with every extension view and has a single task: pass its global on to the background page for further processing.
 */
const { document, location, history, } = global;
if (!(/^[\w-]+-extension:\/\//).test(location.href)) { console.error(`This script can only be loaded in extension pages`); return; }
document.currentScript.remove(); // ==> body is now empty

const chrome = /**@type{any}*/(global).browser || global.chrome || null;
const main = global.background = chrome && (await new Promise(done => chrome.runtime.getBackgroundPage(done)));
const options = { }; location.search && location.search.replace(/^\?/, '').split('&').map(s => (/^([^=]*)=?(.*)$/).exec(s)).forEach(([ _, k, v, ]) => (options[k] = v));

if (options.waitForReload === 'true') { // After extension reload. Just wait for the background to reload all unhandled `browser.extension.getViews()`s.
	delete options.waitForReload; history.replaceState(history.state, '', getUrl());
	if (!main || !main.define) { global.document.body.innerHTML = `<h1 style="font-family: Segoe UI, Tahoma, sans-serif;">Loading ...</a>`; return; }
	// or continue if the background page has already loaded (far enough to `require('./views')`)
}

if (options.skipChecks === 'true') { // Avoid recursion, which would be very hard for the user to stop.
	delete options.skipChecks; history.replaceState(history.state, '', getUrl());
} else
if (!main) {
	if (!chrome) { // Firefox's inline options page after extension reload. Must reload once to show up in browser.extension.getViews()
		options.waitForReload = 'true'; history.replaceState(history.state, '', getUrl());
		location.reload(); return;
	}
	// in a Firefox incognito context without access to the background page
	console.error(`Can't open view in non-normal context`);
	const browser = /**@type{any}*/(global).browser; // This only happens in Firefox, so `browser` with promise support is present.
	const tab = (await browser.tabs.getCurrent());
	if (tab) { // in a container or incognito tab
		const windows = (await browser.windows.getAll());
		const current = windows.find(_=>_.id === tab.windowId);
		const parent = !current.incognito ? current : windows.find(_=>!_.incognito && _.type === 'normal') || null; // get any window that is non-private
		options.skipChecks = 'true'; // very much avoid recursion
		options.originalTab = tab.id; // needed to resolve promises
		const focused = tab.active && current.focused; // the window of the new tab should be focused if the current tab is focused
		const index = parent === current ? tab.index : 1e6; // if replacing a container tab, open at original position
		if (parent) {
			browser.tabs.create({ url: getUrl(), windowId: parent.id, index, active: tab.active, });
			focused && browser.windows.update(parent.id, { focused: true, });
		} else {
			const { id, } = (await browser.windows.create({ type: 'normal', url: getUrl(), }));
			focused && browser.windows.update(id, { focused: true, });
		}
		browser.tabs.remove(tab.id); // global.close() won't do // TODO: if possible, go `history.back()` instead?
		return; // abort
	} else if (global.innerHeight < 100 && global.innerWidth < 100) { // in a panel attached to a private window. Open a non-private mode pop-up where the panel would be
		const getActive = browser.tabs.query({ currentWindow: true, active: true, });
		const parent = (await browser.windows.getLastFocused());
		 // the pop-up will not resize itself as the panel would, so the dimensions can be passed as query params 'w' and 'h'
		const width = (options.w |0 || 700) + 14, height = (options.h |0 || 600) + 42; // the maximum size for panels is somewhere around 700x800. Firefox needs some additional pixels: 14x42 for FF54 on Win 10 with dpi 1.25
		const left = Math.round(parent.left + parent.width - width - 25);
		const top = Math.round(parent.top + 74); // the actual frame height of the main window varies, but 74px should place the pop-up at the bottom if the button
		options.skipChecks = 'true'; options.left = left; options.top = top;
		options.emulatePanel = 'true'; // tell background to emulate some panel-specific stuff
		options.originalActiveTab = (await getActive)[0].id; // need to tell the new "panel" which tab it is meant for
		(await browser.windows.create({
			type: 'popup', url: getUrl(), top, left, width, height,
		}));
		return; // abort (opening the popup closes this panel) // BUG[FF60]: closing the panel sometimes brings the (old) window to the front without focusing it, but there is no good workaround here
	}
}

// failed to move to non-private window. This only happens in very weird situations (e.g. in the All-in-One Sidebar)
if (!main) { showError({ title: 'Invalid context', html: `
	This extension page can't be displayed in private windows, container tabs or other non-normal contexts.
	<br><br>Please try to open <a href="${ global.location.href.replace(/"/g, '&quot;') }">${ global.location.href.replace(/</g, '&lt;') }</a> in a normal tab.
`, }); return; }

history.replaceState(history.state, '', getUrl(null));

for (let retry = 1; retry <= 10 && typeof main.define !== 'function'; --retry) {
	(await new Promise(wake => global.setTimeout(wake, retry * 100)));
}
if (!main.define) { throw new Error(`This extension did not start correctly. Reloading this page or disabling and enabling the extension may help.`); }

let id = 'node_modules/web-ext-utils/loader/_view', url = `/${id}.js`; try { ({ id, url: { pathname: url, }, } = main.define(null)); delete main.require.cache[id]; } catch (_) { } // get id of this file

//(await main.require.async('module!'+ id.replace(/_view$/, 'views'))).__initView__(global, options); // work with the background page
//(await main.import('/'+ url.replace(/_view[.]js$/, 'views.esm.js'))).__initView__(global, options); // work with the background page
if (!main.__initView__) {
	let ok; main.__initView__ = new main.Promise(y => { ok = y; }); main.__initView__.resolve = ok;
	const script = main.document.createElement('script'); script.type = 'module'; script.src = url.replace(/_view[.]js$/, '_views-bg.esm.js');
	(main.document.head || main.document.documentElement).appendChild(script);
} (await main.__initView__)(global, options);

function getUrl(query = options) { return location.href.replace(/(?:\?.*?)?(?=#.*|$)/, query ? '?'+ Object.entries(query).map(_=>_.join('=')).join('&') : ''); } // update query

} catch (error) {
	showError({ title: 'Unexpected Error', text: (error ? (error.name ? error.name +': ' : '') + (error.message || '') : ''), });
	console.error(error);
} function showError({ title, text = '', html = '', }) {
	global.document.title = title; global.document.body.innerHTML
	= `<style> :root { background: #424F5A; filter: invert(1) hue-rotate(180deg); font-family: Segoe UI, Tahoma, sans-serif; } </style>
	<h1>500 <small>Fatal Error</small></h1><span id="message"></span>`;
	global.document.querySelector('#message')[html ? 'innerHTML' : 'textContent'] = html || text || '';
} })(this); // eslint-disable-line no-invalid-this
