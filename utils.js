'use strict'; define('web-ext-utils/utils', [ // license: MPL-2.0
	'web-ext-utils/chrome'
], function(
	{ Tabs, Windows, }
) {

/// escapes a string for usage in a regular expression
const escape = string => string.replace(/[\-\[\]\{\}\(\)\*\+\?\.\,\\\^\$\|\#]/g, '\\$&');

/// matches all valid match patterns (exept '<all_urls>') and extracts [ , sheme, host, path, ]
const matchPattern = (/^(?:(\*|http|https|file|ftp):\/\/(\*|(?:\*\.)?[^\/\*]+|)\/(.*))$/);

/**
 * Transforms a valid match pattern into a regular expression which matches all URLs included by that pattern.
 * @param  {string}  pattern  The pattern to transform.
 * @return {RegExp}           The patterns equivalent as a RegExp.
 */
function matchPatternToRegExp(pattern) {
	if (pattern === '<all_urls>') { return (/./); }
	const [ , sheme, host, path, ] = matchPattern.exec(pattern);
	return new RegExp('^(?:'+
		(sheme === '*' ? 'https?' : escape(sheme))
		+':\/\/'+
		escape(host).replace(/\\\*/g, '[^\/]*')
		+'\/'+
		escape(path).replace(/\\\*/g, '.*')
	+')$');
}

/**
 * Can be called during the extension startup to immediately attach all content scripts as they are specified in the 'manifest.json'.
 * Supported keys for each content script are 'js', 'css', 'matches' and 'exclude_matches'. Globs are not supported.
 * Note: If this function is called during the browser startup, it may attach the content scripts to tabs that already have them running (usually just for the active tab, all others will not be visible yet).
 *       To avoid this (and to have a clean update when the extension is reloaded) your content scripts should set global destroy() functions that can be called by the options.cleanup function.
 * @param  {object}    options          Optional options object.
 * @param  {function}  options.cleanup  Optional function whose code is executed in each included tab before each content script to remove old versions of the script.
 * @return {Promise([ natural, ])}      Promise that resolves once the cleanup function ran in all included tabs. The numbers are the number of tabs each content script is applied to.
 *                                      Note, that the content scripts themselves have not necessarily been executed yet.
 */
function attachAllContentScripts({ cleanup, } = { }) {
	if (typeof (cleanup = cleanup || (() => void 0)) !== 'function') { throw new TypeError('"Cleanup" parameter must be a function or falsey'); }

	return Tabs.query({ }).then(tabs => {
		return Promise.all(chrome.runtime.getManifest().content_scripts.map(({ js, css, matches, exclude_matches, }) => {
			const includes = (matches || [ ]).map(matchPatternToRegExp);
			const excludes = (exclude_matches || [ ]).map(matchPatternToRegExp);
			return Promise.all(tabs.map(({ id, url, }) => {
				if (!url || !includes.some(exp => exp.test(url)) || excludes.some(exp => exp.test(url))) { return; }
				return Tabs.executeScript(id, { code: `(${ cleanup })();`, })
				.then(() => {
					css && css.forEach(file => chrome.tabs.insertCSS(id, { file, }));
					js && js.forEach(file => chrome.tabs.executeScript(id, { file, }));
					return true;
				})
				.catch(error => console.warn('skipped tab', error)); // not allowed to execute
			})).then(_=>_.filter(_=>_).length);
		}));
	});
}

/**
 * Shows or opens a tab containing an extension page.
 * Shows the fist tab whose .pathname equals 'match' and that has a window.tabId set, or opens a new tab containing 'url' if no such tab is found.
 * To set a window.tabId, include ``chrome.tabs.getCurrent(tab => tab && (window.tabId = tab.id))`` in a script in the tabs that should be matchable.
 * @param  {string}        url    The url to open in the new tab if no existing tab was found.
 * @param  {string}        match  Optional value of window.location.pathname a existing tab must have to be focused.
 * @return {Promise<Tab>}         The chrome.tabs.Tab that is now the active tab in the focused window.
 */
function showExtensionTab(url, match = url) {
	const window = chrome.extension.getViews({ type: 'tab', }).find(window => window.location.pathname === match && window.tabId != null);
	return (window ? Tabs.update(window.tabId, { active: true, }) : Tabs.create({ url: chrome.extension.getURL(url), }))
	.then(tab => Windows.update(tab.windowId, { focused: true, }).then(() => tab));
}

return {
	matchPatternToRegExp,
	attachAllContentScripts,
	showExtensionTab,
};

});
