(async function(global) { 'use strict'; try { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
const { document, location, history, } = global;
document.currentScript.remove(); // ==> body is now empty

const chrome = global.browser || global.chrome;
const main = global.background = chrome && chrome.extension.getBackgroundPage();
// let main; if (chrome) { try { main = chrome.extension.getBackgroundPage(); } catch (_) { main = (await new Promise(done => chrome.runtime.getBackgroundPage(done))); } } // edge doesn't allow extension.getBackgroundPage() with event pages
const options = new global.URLSearchParams(location.search);

if (options.get('waitForReload') === 'true') { // after extension reload. Just wait for the background to reload all unhandled browser.extension.getViews()s
	options.delete('waitForReload'); history.replaceState(history.state, '', getUrl());
	if (!main || !main.initView) { return void (global.document.body.innerHTML = `<h1 style="font-family: Segoe UI, Tahoma, sans-serif;">Loading ...</a>`); }
}

if (options.get('skipChecks') === 'true') { // avoid recursion, which would be very hard for the user to stop
	options.delete('skipChecks'); history.replaceState(history.state, '', getUrl());
} else
if (!main) {
	if (!chrome) { // Firefox's inline options page after extension reload. Must reload once to show up in browser.extension.getViews()
		options.set('waitForReload', 'true'); history.replaceState(history.state, '', getUrl());
		return void location.reload();
	}
	// in a Firefox incognito context without access to the background page
	console.error(`Can't open view in non-normal context`);
	const browser = global.browser;
	const tab = (await browser.tabs.getCurrent());
	if (tab) { // in a container or incognito tab
		const windows = (await browser.windows.getAll());
		const parent = windows.find(_=>!_.incognito && _.type === 'normal'); // get any window that is non-private
		options.set('skipChecks', 'true'); // very much avoid recursion
		options.set('originalTab', tab.id); // needed to resolve promises
		browser.tabs.create({
			url: getUrl(), windowId: parent.id, active: !document.hidden, // the new tab should be active if the current one is
		});
		// the window of the new tab should be focused if the current one is
		!document.hidden && windows.find(_=>_.id === tab.windowId).focused && browser.windows.update(parent.id, { focused: true, });
		browser.tabs.remove(tab.id); // global.close() won't do
		return; // abort
	} else if (global.innerHeight < 100 && global.innerWidth < 100) { // in a panel attached to a private window. Open a non-private mode pop-up where the panel would be
		const getActive = browser.tabs.query({ currentWindow: true, active: true, });
		const parent = (await browser.windows.getLastFocused());
		 // the pop-up will not resize itself as the panel would, so the dimensions can be passed as query params 'w' and 'h'
		const width = (options.get('w') <<0 || 700) + 14, height = (options.get('h') <<0 || 600) + 42; // the maximum size for panels is somewhere around 700x800. Firefox needs some additional pixels: 14x42 for FF54 on Win 10 with dpi 1.25
		const left = Math.round(parent.left + parent.width - width - 25);
		const top = Math.round(parent.top + 74); // the actual frame height of the main window varies, but 74px should place the pop-up at the bottom if the button
		options.set('skipChecks', 'true'); options.set('left', left); options.set('top', top);
		options.set('emulatePanel', 'true'); // tell background to emulate some panel-specific stuff
		options.set('originalActiveTab', (await getActive)[0].id); // need to tell the new "panel" which tab it is meant for
		(await browser.windows.create({
			type: 'popup', url: getUrl(), top, left, width, height,
		}));
		return; // abort
	}
}

// failed to move to non-private window. This only happens in very weird situations (e.g. in the All-in-One Sidebar)
if (!main) { throw new Error(`
	This extension page can't be displayed in private windows, container tabs or other non-normal contexts.
	<br><br>Please try to open <a href="${ global.location.href }">${ global.location }</a> in a normal tab.
`); }
if (!main.initView) { throw new Error(`This extension did not start correctly. Disabling and enabling it may help.`); }

history.replaceState(history.state, '', getUrl(null));
main.initView(global, options); // work with the background page

function getUrl(query = options) { return location.href.replace(/(?:\?.*?)?(?=#.*|$)/, query ? '?'+ query : ''); } // update query

// inline scripts are not allowed (CSP, firefox), so this is not a security problem
} catch (error) { (global.document.body.innerHTML = `
	<style> :root { background: #424F5A; filter: invert(1) hue-rotate(180deg); font-family: Segoe UI, Tahoma, sans-serif; } </style>
	<h1>500</h1>
	`+ (error ? (error.name ? error.name +': ' : '') + (error.message || '') : '') +`
`); console.error(error); } })(this);
