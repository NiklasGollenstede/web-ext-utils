(async function(global) { 'use strict'; // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
const { document, location, history, } = global;
document.currentScript.remove(); // ==> body is now empty

const chrome = global.browser || global.chrome;
const main = global.background = chrome && chrome.extension.getBackgroundPage();
// let main; if (chrome) { try { main = chrome.extension.getBackgroundPage(); } catch (_) { main = (await new Promise(done => chrome.runtime.getBackgroundPage(done))); } } // edge doesn't allow extension.getBackgroundPage() with event pages

if ((/##doCloseOnBlur##\d+#-?\d+#-?\d+$/).test(location.href)) { // the view was an incognito panel (see below), so it should close it on blur
	global.addEventListener('blur', event => global.close());
	const { windowId, } = (await global.browser.tabs.getCurrent());
	global.resize = (width, height) => global.browser.windows.update(windowId, { width, height, }); // provide a function for the view to resize itself. TODO: should probably add some px as well
	const [ match, activeTab, left, top, ] = (/##doCloseOnBlur##(\d+)#(-?\d+)#(-?\d+)$/).exec(location.href);
	global.activeTab = activeTab; // the "panel" can't query for the active tab itself, because that is now its own tab
	history.replaceState(null, '', location.href.slice(0, -match.length));
	(await global.browser.windows.update(windowId, { top: +top, left: +left, })); // firefox currently ignores top and left in .create(), so move it here
} else
if ((/##doNotRecurse##$/).test(location.href)) { // avoid recursion, which would be very hard to stop for the user
	history.replaceState(null, '', location.href.replace(/##doNotRecurse##$/, ''));
} else
if (!main) {
	if (!chrome) { // Firefox's inline options page after extension reload
		history.replaceState(null, '', location.href +'##doNotRecurse##');
		return void location.reload();
	}
	// in a Firefox incognito context without access to the background page
	console.error(`Can't open view in Private Window`);
	const browser = global.browser;
	const tab = (await browser.tabs.getCurrent());
	if (!tab) { // in a panel. Open a non-private mode popup where the panel would be
		const getActive = browser.tabs.query({ currentWindow: true, active: true, });
		const parent = (await browser.windows.getLastFocused());
		const options = new global.URLSearchParams(location.hash.split('?')[1] || ''); // the popup will not resize itself as the panel would, so the dimensions can be passed as query params 'w' and 'h'
		const width = (options.get('w') <<0 || 700) + 14, height = (options.get('h') <<0 || 600) + 42; // the maximum size for panels is somewhere around 700x800. Firefox needs some additional pixels 14x42 for FF54 on Win 10 with dpi 1.25
		const left = Math.round(parent.left + parent.width - width - 25);
		const top = Math.round(parent.top + 74); // the actual frame height varies, but 74px should place the popup at the bottom if the button
		(await browser.windows.create({
			type: 'popup', url: location.href +`##doCloseOnBlur##${ (await getActive)[0].id }#${ left }#${ top }`, // the panel would close itself on blur, so emulate that (see above)
			top, left, width, height,
		}));
	} else { // in a tab in a private window (unless someone explicitly opened a view in an incognito popup)
		const windows = (await browser.windows.getAll());
		const parent = windows.find(_=>!_.incognito); // get any window that is non-private
		browser.tabs.create({
			url: location.href +'##doCloseOnBlur##', // very much avoid recursion
			windowId: parent.id, active: !document.hidden, // the new tab should be active if the current one is
		});
		// the window of the new tab should be focused if the current one is
		!document.hidden && windows.find(_=>_.id === tab.windowId).focused && browser.windows.update(parent.id, { focused: true, });
		browser.tabs.remove(tab.id); // global.close() won't do
	}
	return; // abort
}

// this never happened so far, but better save then sorry
if (!main) { document.body.innerHTML = '<h1>500</h1>'; return; } // failed to move to non-private window

main.initView(global); // work with the background page

})(this);
