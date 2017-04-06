(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../../browser/': { manifest, },
	'../../browser/version': { current: currentBrowser, version: browserVersion, },
	'./': Editor,
	about,
	'common/options': options,
	require,
}) => ({ document, }) => {

document.title = 'Options - '+ manifest.name;

[ 'index', 'inline', 'about', ].forEach(style => {
	const link = document.createElement('link');
	link.href = require.toUrl(`./${ style }.css`);
	link.rel = 'stylesheet';
	link.scoped = true;
	document.body.appendChild(link);
});

new Editor({
	options, prefix: '',
	host: Object.assign(document.body.appendChild(document.createElement('form')), { id: 'options', }),
});

about({
	manifest,
	host: Object.assign(document.body.appendChild(document.createElement('div')), { id: 'about', }),
	browser: { name: currentBrowser.replace(/^./, c => c.toUpperCase()), version: browserVersion, },
});

}); })(this);
