(function (global) { 'use strict';

if (global.innerWidth > 1 || global.innerHeight > 1) { // stop loading at once if the background page was opened in a tab or window
	console.warn(`Background page opened in view`);
	global.history.replaceState({ message: `The background page can not be displayed`, }, null, '/view.html#403');
	global.stop(); global.location.reload();
	return;
}

// show notification if the extension failed to start
global.require('background/', () => null, error => define(({
	'../browser/': { manifest, },
	'../utils/': { reportError, },
}) => {
	reportError(`${ manifest.name } failed to start!`, error);
}));

})(this);
