// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

const _api = /**@type{any}*/(globalThis).browser || globalThis.chrome;
const ua = globalThis.navigator.userAgent;
const rootUrl = _api.extension.getURL('');

/** Any blink/chromium based browser. */ export
const blink = rootUrl.startsWith('chrome-');
/** Opera desktop (Chromium). */ export
const opera = blink && (/ OPR\/\d+\./).test(ua);
/** Vivaldi (Chromium). */ export
const vivaldi = blink && (/ Vivaldi\/\d+\./).test(ua);
/** Chromium and not Google Chrome, Opera or Vivaldi. */ export
const chromium = blink && (/ Chromium\/\d+\./).test(ua);
/** Google Chrome (Chromium). */ export
const google = blink && !opera && !vivaldi && !chromium;
/** Google Chrome (Chromium) (alias). */ export
const chrome = google;

/** Any Mozilla browser. */ export
const gecko = !blink && rootUrl.startsWith('moz-');
/** Firefox for Android. */ export
const fennec = false; // Not supported ATM
/** Firefox for anything but Android. */ export
const firefox = gecko && !fennec;

/** MS Edge */ export
const edgeHTML = !blink && !gecko && rootUrl.startsWith('ms-browser-');
/** MS Edge */ export
const edge = edgeHTML;


/** The current browser, one of [ 'firefox', 'fennec', 'chromium', 'opera', 'vivaldi', 'chrome', 'edge', ]. */ export
const current = (() => { switch (true) {
	case (firefox):         return 'firefox';
//	case (fennec):          return 'fennec';
	case (chromium):        return 'chromium';
	case (opera):           return 'opera';
	case (vivaldi):         return 'vivaldi';
	case (google):          return 'chrome';
	case (edge):            return 'edge';
} return null; })();

/** @type  {string} String version of the current browser, as read from the UserAgent string. For gecko browsers it is feature-detected. */ export
const version = (() => { switch (true) {
	case (edge):            return           (/Edge\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (vivaldi):         return        (/Vivaldi\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (opera):           return            (/OPR\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (blink):           return (/Chrom(?:e|ium)\/((?:\d+.)*\d+)/).exec(ua)[1];
	case (firefox):           return        (/Firefox\/((?:\d+.)*\d+)/).exec(ua)[1];
} return '0'; })();
