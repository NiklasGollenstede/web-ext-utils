(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'module!../../browser/': { manifest, rootUrl, },
	'../../browser/version': { current: currentBrowser, version: browserVersion, chrome, chromium, fennec, firefox, },
	'module!./about': About,
	'./': Editor,
	'fetch!package.json:json': packageJson,
	'fetch!./index.css:css?': indexCss,
	'fetch!./inline.css:css?': inlineCss,
	'fetch!./about.css:css?': aboutCss,
	'module!../../utils/files': FS,
	require,
	'lazy!fetch!../../loader/_view.js': _1,
}) => { const options = (await (() => {
	const modulePath = require.toUrl('/').slice(rootUrl.length) +'common/options.esm.js';
	return FS.exists(modulePath) ? import('/'+ modulePath).then(_=>_.default) : require.async('common/options');
})()); return (/**@type{{ document: Document, onCommand: any, }}*/{ document, onCommand, }, location) => {

if (fennec && location && location.type !== 'tab') { // the inline options page in fennec is small and buggy
	document.body.innerHTML = `<button>Show Options</button>`;
	document.querySelector('button').onclick = _=>!_.button && require('../../loader/views').openView(document.URL, 'tab');
	return;
}

firefox && location && location.type === 'frame' && (document.documentElement.style.overflowY = 'hidden'); // prevent scrollbar from flashing on resize

(chrome || chromium) && location && location.type === 'frame' && (document.documentElement.style.minWidth = '700px');

document.title = 'Options - '+ manifest.name;

[ indexCss, inlineCss, aboutCss, ].forEach(css => {
	document.head.append(_('style', { textContent: css, }));
});

const intro = document.body.appendChild(_('div', { id: 'intro', }));
fennec && intro.appendChild(_('h1', { textContent: manifest.name, }));
!firefox && intro.appendChild(_('p', { style: 'margin: .25em 0 1.25em 0', })).append(
	(manifest.description || packageJson.description).replace(/([^!?.])$/, '$1.') +' ',
	manifest.homepage_url || packageJson.homepage ? _('a', {
		href: manifest.homepage_url || packageJson.homepage,
		target: '_blank', textContent: 'More information',
		style: 'display: inline-block',
	}) : '',
);
intro.appendChild(_('h2', { textContent: 'Options', style: 'margin: 0; font-weight: normal;', }));

new Editor({
	options, prefix: '', onCommand,
	host: Object.assign(document.body.appendChild(document.createElement('form')), { id: 'options', }),
});

About({
	manifest, package: packageJson,
	host: Object.assign(document.body.appendChild(document.createElement('div')), { id: 'about', }),
	browser: { name: currentBrowser.replace(/^./, c => c.toUpperCase()), version: browserVersion, },
});

/**@return{HTMLElement}*/function _(/**@type{string}*/tag, /**@type{any}*/props) { return Object.assign(document.createElement(tag), props); }

}; }); })(this); // eslint-disable-line no-invalid-this
