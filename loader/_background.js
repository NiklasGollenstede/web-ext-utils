(function (global) { 'use strict';

if (global.innerWidth > 1 || global.innerHeight > 1) { // stop loading at once if the background page was opened in a tab or window
	console.warn(`Background page opened in view`);
	global.history.replaceState({ message: `The background page can not be displayed`, }, null, '/view.html#403');
	global.stop(); global.location.reload();
	return;
}

const { require, } = define(null), chrome = (typeof browser !== 'undefined' ? browser : global.chrome); /* global browser, */

// show notification if the extension failed to start
require('background/', () => null, async error => (await require.async('../utils/')).reportError(
	`${ (await require.async('../browser/')).manifest.name } failed to start!`, error
));

// reload old views
const views = chrome.extension.getViews().filter(view => view !== global);
views.length && require.async('./views').then(async ({ getViews, }) => {
	const known = getViews().map(_=>_.view);
	views.forEach(view => !known.includes(view) && view.location.reload());
});

})(this);
