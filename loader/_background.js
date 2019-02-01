(function (global) { 'use strict';

const chrome = (typeof browser !== 'undefined' ? browser : global.chrome); /* global browser, */

if (chrome.extension.getBackgroundPage() !== global) { // stop loading at once if the background page was opened manually
	console.warn(`Background page opened in view`);
	global.history.replaceState({ title: 'Access denied', message: `The background page can not be displayed`, }, null, '/view.html#403');
	global.stop(); global.location.reload(); return;
}

const { require, } = define(null);

// show notification if the extension failed to start
require('background/', () => null, async error => {
	require.async('../utils/notify').then(_=>_.error(
		`${ chrome.runtime.getManifest().name } failed to start!`, error,
	));
	const Menus = chrome.menus || chrome.contextMenus; if (Menus) {
		Menus.create({ contexts: [ 'browser_action', ], id: 'web-ext-utils:restart', title: 'Restart Extension', });
		Menus.onClicked.addListener(({ menuItemId, }) => { menuItemId === 'web-ext-utils:restart' && chrome.runtime.reload(); });
	}
});

// reload old views
const views = chrome.extension.getViews().filter(view => view !== global);
views.length && require.async('./views').then(async ({ getViews, }) => {
	const known = getViews().map(_=>_.view);
	views.forEach(view => { if (!known.includes(view)) {
		console.info('Reloading previous view', view.location.href); view.location.reload();
	} });
});

})(this);
