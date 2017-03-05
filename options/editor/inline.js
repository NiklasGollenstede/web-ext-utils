(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../../browser/': { manifest, },
	'../../browser/version': { current: currentBrowser, version: browserVersion, },
	'./': Editor,
	about,
	'common/options': options,
	require,
}) => window => {
const { document, } = window;
(window.browser || window.chrome).tabs.getCurrent(tab => tab && (window.tabId = tab.id));

document.title = 'Options - '+ manifest.name;

[ 'index', 'inline', 'about', ].forEach(style => {
	const link = document.createElement('link');
	link.href = require.toUrl(`./${ style }.css`);
	link.rel = 'stylesheet';
	document.head.appendChild(link);
});

new Editor({
	options,
	host: document.body.appendChild(document.createElement('form')),
});

about({
	manifest,
	host: document.body.appendChild(document.createElement('div')),
	browser: { name: currentBrowser.replace(/^./, c => c.toUpperCase()), version: browserVersion, },
});

}); })(this);
