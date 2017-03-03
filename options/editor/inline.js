(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/browser/version': { current: currentBrowser, version: browserVersion, fennec, },
	'node_modules/web-ext-utils/options/editor/': Editor,
	'node_modules/web-ext-utils/options/editor/about': about,
	'common/options': options,
}) => {
const chrome = global.browser || global.chrome;

window.options = options;
chrome.tabs.getCurrent(tab => tab && (window.tabId = tab.id));

new Editor({
	options,
	host: document.querySelector('#options'),
});

const manifest = chrome.runtime.getManifest();
global.document.title = 'Options - '+ manifest.name;
about({
	manifest,
	host: document.querySelector('#about'),
	browser: { name: currentBrowser.replace(/^./, c => c.toUpperCase()), version: browserVersion, },
});

}); })(this);
