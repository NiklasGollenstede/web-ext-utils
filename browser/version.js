(function(global) { 'use strict'; const factory = function webExtUtils_chrome(exports) { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

const _api = global.chrome || global.browser;

const ua = navigator.userAgent;
const rootUrl = _api.extension.getURL('');
const blink = rootUrl.startsWith('chrome');
const opera = blink && (/ OPR\/\d+\./).test(ua); // TODO: is this safe to do?
const vivaldi = blink && (/ Vivaldi\/\d+\./).test(ua); // TODO: is this safe to do?
const google = blink && !opera && !vivaldi; // TODO: test for Google Chrome specific api
const chromium = blink && !opera && !vivaldi && !google;

const gecko = rootUrl.startsWith('moz');
const fennec = gecko && !(_api.windows); // can't use userAgent (may be faked) // TODO: this may be added in the future
const firefox = gecko && !fennec;

const edgeHTML = rootUrl.startsWith('ms-browser');
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

const appVersion = (() => { switch (true) {
	case (edge):            return           (/Edge\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (vivaldi):         return        (/Vivaldi\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (opera):           return            (/OPR\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (blink):           return (/Chrom(?:e|ium)\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (fennec): switch (true) {
		// TODO: keep up to date
		case !!(_api.sessions && _api.sessions.onChanged): return '53.0'; // TODO:  test
		case !!(_api.runtime.onInstalled): return '52.0';
		case !!(_api.management && _api.management.getSelf): return '51.0';
		case !!(_api.pageAction && _api.pageAction.show): return '50.0';
		default: return '48.0';
	}
	case (firefox): switch (true) {
		// TODO: keep up to date
		case !!(_api.sessions && _api.sessions.onChanged): return '53.0'; // TODO:  test
		case !!(_api.runtime.onInstalled): return '52.0';
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
		if (self.hasOwnProperty(key)) { return self[key]; }
		throw new Error(`Unknown application "${ key }"`);
	},
	set() { },
});

}; if (typeof define === 'function' && define.amd) { define([ 'exports', ], factory); } else { const exp = { }, result = factory(exp) || exp; if (typeof exports === 'object' && typeof module === 'object') { /* eslint-disable */ module.exports = result; /* eslint-enable */ } else { global[factory.name] = result; } } })(this);
