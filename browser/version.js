(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	module,
}) => {

const _api = global.browser || global.chrome;
const ua = global.navigator.userAgent;
const rootUrl = _api.extension.getURL('');
const info = typeof _api.runtime.getBrowserInfo === 'function' && (await _api.runtime.getBrowserInfo()) || module.config();

const blink = rootUrl.startsWith('chrome-');
const opera = blink && (/ OPR\/\d+\./).test(ua);
const vivaldi = blink && (/ Vivaldi\/\d+\./).test(ua);
const chromium = blink && (/ Chromium\/\d+\./).test(ua);
const google = blink && !opera && !vivaldi && !chromium;

const gecko = !blink && rootUrl.startsWith('moz-');
const fennec = gecko && (info ? (/^fennec$/i).test(info.name) : _api.extension.getBackgroundPage === 'function' ? !(_api.windows) : (/Android/).test(ua)); // shouldn't use userAgent (may be faked)
const firefox = gecko && !fennec;

const edgeHTML = !blink && !gecko && rootUrl.startsWith('ms-browser-');
const edge = edgeHTML;

const currentApp = (() => { switch (true) {
	case (firefox):         return 'firefox';
	case (fennec):          return 'fennec';
	case (chromium):        return 'chromium';
	case (opera):           return 'opera';
	case (vivaldi):         return 'vivaldi';
	case (google):          return 'chrome';
	case (edge):            return 'edge';
} return null; })();

const appVersion = info ? info.version
: (() => { switch (true) {
	case (edge):            return           (/Edge\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (vivaldi):         return        (/Vivaldi\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (opera):           return            (/OPR\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (blink):           return (/Chrom(?:e|ium)\/((?:\d+.)*\d+)/).exec(ua)[1];

	// only relevant prior to FF51 and in content scripts:
	// TODO: add tests that work in content scripts
	case (fennec): switch (true) {
		case !!(_api.storage.sync): return '52.0'; // test should work in content
		case !!(_api.management && _api.management.getSelf): return '51.0';
		case !!(_api.pageAction && _api.pageAction.show): return '50.0';
		default: return '48.0';
	}
	case (firefox): switch (true) {
		case !!(_api.storage.sync): return '52.0'; // test should work in content
		case !!(_api.management && _api.management.getSelf): return '51.0';
		case !!(_api.runtime.connectNative || _api.history && _api.history.getVisits): return '50.0'; // these require permissions
		case !!(_api.tabs.removeCSS): return '49.0';
		case !!(_api.commands.getAll): return '48.0';
		case !!(_api.tabs.insertCSS): return '47.0';
		case !!(_api.tabs.move): return '46.0';
		default: return '45.0';
	}
} return '0'; })();

/**
 * An object of mostly booleans indicating the browser this WebExtension is running in
 * Accessing any other property than those listed above will throw:
 * @property  {boolean}  gecko          Any Mozilla browser.
 * @property  {boolean}  firefox        Firefox desktop.
 * @property  {boolean}  fennec         Firefox for Android. This is not extracted from the userAgent.
 * @property  {boolean}  blink          Any blink/chromium based browser.
 * @property  {boolean}  chromium       Chromium and not Google Chrome, Opera or Vivaldi.
 * @property  {boolean}  opera          Opera desktop (Chromium).
 * @property  {boolean}  vivaldi        Vivaldi (Chromium).
 * @property  {boolean}  google         Google Chrome (Chromium).
 * @property  {boolean}  chrome         Google Chrome (Chromium) (alias).
 * @property  {boolean}  edgeHTML       MS Edge
 * @property  {boolean}  edge           MS Edge
 * @property  {string}   current        The current browser, one of [ 'firefox', 'fennec', 'chromium', 'opera', 'vivaldi', 'chrome', 'edge', ].
 * @property  {string}   version        String version of the current browser, as read from the UserAgent string. For gecko browsers it is feature-detected.
 */
return new Proxy(Object.freeze({
	gecko, firefox, fennec,
	blink, chromium, google, chrome: google, opera, vivaldi,
	edgeHTML, edge,
	current: currentApp, version: appVersion,
	then: undefined, // for Promise.resolve()
}), {
	get(self, key) {
		if (Object.hasOwnProperty.call(self, key)) { return self[key]; }
		throw new Error(`Unknown application "${ key }"`);
	},
	set() { },
});

}); })(this);
