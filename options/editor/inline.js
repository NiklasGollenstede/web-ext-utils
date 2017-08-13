(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../../browser/': { manifest, },
	'../../browser/version': { current: currentBrowser, version: browserVersion, fennec, },
	'./': Editor,
	about,
	'common/options': options,
	require,
}) => ({ document, onCommand, }, { type = 'tab', }) => {

if (fennec && type !== 'tab') { // the inline options page in fennec is small and buggy
	document.body.innerHTML = `<button>Show Options</button>`;
	document.querySelector('button').onclick = _=>!_.button && require('../../loader/views').openView(document.URL, 'tab');
	return;
}

document.title = 'Options - '+ manifest.name;

[ 'index', 'inline', 'about', ].forEach(style => {
	const link = document.createElement('link');
	link.href = require.toUrl(`./${ style }.css`);
	link.rel = 'stylesheet';
	link.scoped = true;
	document.body.appendChild(link);
});

new Editor({
	options, prefix: '', onCommand,
	host: Object.assign(document.body.appendChild(document.createElement('form')), { id: 'options', }),
});

about({
	manifest,
	host: Object.assign(document.body.appendChild(document.createElement('div')), { id: 'about', }),
	browser: { name: currentBrowser.replace(/^./, c => c.toUpperCase()), version: browserVersion, },
});

}); })(this);
