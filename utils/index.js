(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../browser/': { runtime, extension, Tabs, Windows, },
	require,
}) => {


/**
 * Transforms a valid match pattern into a regular expression which matches all URLs included by that pattern.
 * Passes all examples and counter-examples listed here https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Match_patterns#Examples
 * @param  {string}  pattern  The pattern to transform.
 * @return {RegExp}           The patterns equivalent as a RegExp.
 * @throws {TypeError}        If the pattern string is not a valid MatchPattern
 */
function matchPatternToRegExp(pattern) {
	if (pattern === '<all_urls>') { return (/^(?:https?|file|ftp|app):\/\//); } // TODO: this is from mdn, check if chrome behaves the same
	const match = rMatchPattern.exec(pattern);
	if (!match) { throw new TypeError(`"${ pattern }" is not a valid MatchPattern`); }
	const [ , scheme, host, path, ] = match;
	return new RegExp('^(?:'
		+ (scheme === '*' ? 'https?' : escapeForRegExp(scheme)) +'://'
		+ (host === '*' ? '[^/]+?' : escapeForRegExp(host).replace(/^\\\*\\./g, '(?:[^/]+?.)?'))
		+ (path ? '/'+ escapeForRegExp(path).replace(/\\\*/g, '.*') : '/?')
	+')$');
}
/// escapes a string for usage in a regular expression
const escapeForRegExp = string => string.replace(/[[\]{}()*-+?.,^$|#\\]/g, '\\$&');
/// matches all valid match patterns (except '<all_urls>') and extracts [ , scheme, host, path, ]
const rMatchPattern = (/^(?:(\*|http|https|file|ftp|app):\/\/(\*|(?:\*\.)?[^/*]+|)\/(.*))$/i);

function parseMatchPatterns(patterns) {
	!Array.isArray(patterns) && (patterns = [ patterns, ]);
	return patterns.map(pattern => {
		if (typeof pattern === 'object' && typeof pattern.test === 'function') { return new RegExp(pattern); }
		if (typeof pattern === 'string' && pattern[0] === '^' && pattern.slice(-1) === '$') { return new RegExp(pattern, 'i'); }
		try { return matchPatternToRegExp(pattern); }
		catch (_) { throw new TypeError(`Expected (Array of) RegExp objects, MatchPattern strings or regexp strings framed with '^' and '$', got "${ pattern }"`); }
	});
}

/**
 * Can be called during the extension startup to immediately attach all content scripts as they are specified in the 'manifest.json',
 * which does not happen automatically in chromium browsers. In firefox it is not necessary to call this function.
 * Supported keys for each content script are 'js', 'css', 'matches' and 'exclude_matches'. Globs are not supported.
 * Note: If this function is called during the browser startup, it may attach the content scripts to tabs that already have them running (usually just for the active tab, all others will not be visible yet).
 *       To avoid this (and to have a clean update when the extension is reloaded) your content scripts should set global destroy() functions that can be called by the options.cleanup function.
 * @param  {object}    options          Optional options object.
 * @param  {function}  options.cleanup  Optional function whose code is executed in each included tab before each content script to remove old versions of the script.
 * @return {Promise([ natural, ])}      Promise that resolves once the cleanup function ran in all included tabs. The numbers are the number of tabs each content script is applied to.
 *                                      Note, that the content scripts themselves have not necessarily been executed yet.
 */
async function attachAllContentScripts({ cleanup, } = { }) {
	if (typeof (cleanup = cleanup || (() => void 0)) !== 'function') { throw new TypeError('"Cleanup" parameter must be a function or falsey'); }
	const allTabs = (await Tabs.query({ }));
	const scripts = runtime.getManifest().content_scripts;

	return Promise.all(scripts.map(({ js, css, matches, exclude_matches, }) => {
		const includes = (matches || [ ]).map(matchPatternToRegExp);
		const excludes = (exclude_matches || [ ]).map(matchPatternToRegExp);
		return Promise.all(allTabs
			.filter(({ url, }) => url && includes.some(exp => exp.test(url)) && !excludes.some(exp => exp.test(url)))
			.map(async ({ id, }) => {
				try { (await Tabs.executeScript(id, { code: `(${ cleanup })();`, })); }
				catch (error) { console.warn('skipped tab', error); return false; } // not allowed to execute
				css && css.forEach(file => Tabs.insertCSS(id, { file, }));
				js && js.forEach(file => Tabs.executeScript(id, { file, }));
				return true;
			})
		).then(_=>_.filter(_=>_).length);
	}));
}

/**
 * Shows or opens a tab containing an extension page.
 * Shows the fist tab whose .pathname equals 'match' and that has a window.tabId set, or opens a new tab containing 'url' if no such tab is found.
 * @param  {string}        url    The url to open in the new tab if no existing tab was found.
 * @param  {string}        match  Optional value of window.location.pathname a existing tab must have to be focused.
 * @return {Promise<Tab>}         The chrome.tabs.Tab that is now the active tab in the focused window.
 */
async function showExtensionTab(url, match = url) {
	match = extension.getURL(match || url); url = extension.getURL(url);
	for (const view of extension.getViews({ type: 'tab', })) {
		if (view && (typeof match === 'string' ? view.location.href === match : match.test(view.location.href)) && view.tabId != null) {
			const tab = (await new Promise(got => (view.browser || view.chrome).tabs.getCurrent(got)));
			if (tab) { (await Tabs.update(tab.id, { active: true, })); (await Windows.update(tab.windowId, { focused: true, })); return tab; }
		}
	}
	return Tabs.create({ url, });
}

let getNotify; async function notify(method, ...args) {
	const notify = (await (getNotify = getNotify || (() => {
		console.warn('Deprecated, use `notify` module!');
		return require.async('./notify');
	})()));
	return notify[method](...args);
}

return {
	matchPatternToRegExp,
	parseMatchPatterns,
	attachAllContentScripts,
	showExtensionTab,
	reportError: notify.bind(null, 'error'),
	reportSuccess: notify.bind(null, 'success'),
};

}); })(this);
