// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

import Browser from '../../browser/index.esm.js'; const { manifest, rootUrl, } = Browser;
import { current as currentBrowser, version as browserVersion, chrome, chromium, fennec, firefox, } from '../../browser/version.esm.js';
import About from './about.esm.js';
import Editor from './index.esm.js';
import FS from '../../utils/files.esm.js';
const require = (/**@type {{ require: { async(id: string): Promise<any>,toUrl(id: string): string, }, }}*/(/**@type {any}*/(globalThis))).require;
const packageJson = (await (await globalThis.fetch('/package.json')).json());
// @ts-ignore
if (false) { import('../../loader/_view.js'); import('../../loader/_views-bg.esm.js'); import('./about.css'); import('./index.css'); import('./inline.css'); } // eslint-disable-line no-constant-condition

const options = (await (async () => {
	const modulePath = require.toUrl('/').slice(rootUrl.length) +'common/options.esm.js';
	return FS.exists(modulePath) ? import('/'+ modulePath).then(_=>_.default) : require.async('common/options');
})());

export default (/**@type{{ document: Document, onCommand: any, }}*/{ document, onCommand, }, location) => {

firefox && location && location.type === 'frame' && (document.documentElement.style.overflowY = 'hidden'); // prevent scrollbar from flashing on resize

(chrome || chromium) && location && location.type === 'frame' && (document.documentElement.style.minWidth = '700px');

document.title = 'Options - '+ manifest.name;

[ 'index', 'inline', 'about', ].forEach(name => {
	document.head.append(_('link', { rel: 'stylesheet', href: new globalThis.URL(`./${name}.css`, import.meta.url), }));
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

Editor({
	options, prefix: '', onCommand,
	host: Object.assign(document.body.appendChild(document.createElement('form')), { id: 'options', }),
});

About({
	manifest, package: packageJson,
	host: Object.assign(document.body.appendChild(document.createElement('div')), { id: 'about', }),
	browser: { name: currentBrowser.replace(/^./, c => c.toUpperCase()), version: browserVersion, },
});

/**@return{HTMLElement}*/function _(/**@type{string}*/tag, /**@type{any}*/props) { return Object.assign(document.createElement(tag), props); }

};
