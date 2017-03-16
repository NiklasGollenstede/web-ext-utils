(async function(global) { 'use strict'; try { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
const { document, location, history, } = global;
document.currentScript.remove(); // ==> body is now empty

const chrome = global.browser || global.chrome;
const main = global.background = chrome && chrome.extension.getBackgroundPage();
// let main; if (chrome) { try { main = chrome.extension.getBackgroundPage(); } catch (_) { main = (await new Promise(done => chrome.runtime.getBackgroundPage(done))); } } // edge doesn't allow extension.getBackgroundPage() with event pages

if ((/##mayWait##$/).test(location.href)) { // after reload when it is OK to just wait for the extension to reload this view once again
	history.replaceState(null, '', location.href.replace(/##mayWait##$/, ''));
	if (!main || !main.initView) { return void (global.document.body.innerHTML = `<h1 style="font-family: Segoe UI, Tahoma, sans-serif;">Loading ...</a>`); }
} else
if ((/##doCloseOnBlur##\d+#-?\d+#-?\d+$/).test(location.href)) { // the view was an incognito panel (see below), so it should close it on blur
	global.addEventListener('blur', event => global.close());
	const { windowId, } = (await global.browser.tabs.getCurrent());
	global.resize = (width = document.scrollingElement.scrollWidth, height = document.scrollingElement.scrollHeight) => {
		global.browser.windows.update(windowId, { width, height, }); // provide a function for the view to resize itself. TODO: should probably add some px as well
	};
	const [ match, activeTab, left, top, ] = (/##doCloseOnBlur##(\d+)#(-?\d+)#(-?\d+)$/).exec(location.href);
	global.activeTab = activeTab; // the "panel" can't query for the active tab itself, because that is now its own tab
	history.replaceState(null, '', location.href.slice(0, -match.length));
	(await global.browser.windows.update(windowId, { top: +top, left: +left, })); // firefox currently ignores top and left in .create(), so move it here
} else
if ((/##doNotRecurse##$/).test(location.href)) { // avoid recursion, which would be very hard for the user to stop
	history.replaceState(null, '', location.href.replace(/##doNotRecurse##$/, ''));
} else
if (!main) {
	if (!chrome) { // Firefox's inline options page after extension reload. must reload once to show up in browser.extension.getViews()
		history.replaceState(null, '', location.href +'##mayWait##');
		return void location.reload();
	}
	// in a Firefox incognito context without access to the background page
	console.error(`Can't open view in Private Window`);
	const browser = global.browser;
	const tab = (await browser.tabs.getCurrent());
	if (!tab) { // in a panel attached to a private window. Open a non-private mode pop-up where the panel would be
		const getActive = browser.tabs.query({ currentWindow: true, active: true, });
		const parent = (await browser.windows.getLastFocused());
		const options = new global.URLSearchParams(location.hash.split('?')[1] || ''); // the pop-up will not resize itself as the panel would, so the dimensions can be passed as query params 'w' and 'h'
		const width = (options.get('w') <<0 || 700) + 14, height = (options.get('h') <<0 || 600) + 42; // the maximum size for panels is somewhere around 700x800. Firefox needs some additional pixels 14x42 for FF54 on Win 10 with dpi 1.25
		const left = Math.round(parent.left + parent.width - width - 25);
		const top = Math.round(parent.top + 74); // the actual frame height varies, but 74px should place the pop-up at the bottom if the button
		(await browser.windows.create({
			type: 'popup', url: location.href +`##doCloseOnBlur##${ (await getActive)[0].id }#${ left }#${ top }`, // the panel would close itself on blur, so emulate that (see above)
			top, left, width, height,
		}));
	} else { // in a container or incognito tab
		const windows = (await browser.windows.getAll());
		const parent = windows.find(_=>!_.incognito); // get any window that is non-private
		browser.tabs.create({
			url: location.href +'##doNotRecurse##', // very much avoid recursion
			windowId: parent.id, active: !document.hidden, // the new tab should be active if the current one is
		});
		// the window of the new tab should be focused if the current one is
		!document.hidden && windows.find(_=>_.id === tab.windowId).focused && browser.windows.update(parent.id, { focused: true, });
		browser.tabs.remove(tab.id); // global.close() won't do
	}
	return; // abort
}

// failed to move to non-private window. This only happens in very weird situations (e.g. in the All-in-One Sidebar)
if (!main) { throw new Error(`
	This extension page can't be displayed here.
	<br>Please try to open <a href="${ global.location.href.replace(/"/g, '&quot;') }">
	${ global.location.href.replace(/\</g, '&lt;').replace(/\>/g, '&gt;') }</a> in a normal tab.
`); }
if (!main.initView) { throw new Error(`This extension did not start correctly. Disabling and enabling it may help.`); }

main.initView(global); // work with the background page

} catch (error) { (global.document.body.innerHTML = `
	<style> * { font-family: Segoe UI, Tahoma, sans-serif; } </style>
	<h1>500</h1>
	`+ (error ? (error.name ? error.name +': ' : '') + (error.message || '') : '') +`
`); console.error(error); } })(this);
