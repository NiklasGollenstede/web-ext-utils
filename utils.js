'use strict'; define('web-ext-utils/utils', [
	'web-ext-utils/chrome'
], function(
	{ Tabs, }
) {

const escape = string => string.replace(/[\-\[\]\{\}\(\)\*\+\?\.\,\\\^\$\|\#]/g, '\\$&');

const matchPattern = (/^(?:(\*|http|https|file|ftp):\/\/(\*|(?:\*\.)?[^\/\*]+|)\/(.*))$/);

function matchPatternToRegExp(pattern) {
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
 * @param  {object}    options          Optional options object
 * @param  {function}  options.cleanup  Optional function whose code is executed in each included tab before each content script to remove old versions of the script.
 * @return {Promise([ natural, ])}      Promise that resolves once the cleanup function ran in all included tabs. The numbers are the number of tabs each content script is applied to.
 *                                      Note, that the content scripts themselves have not necessarily been executed yet
 */
function attachAllContentScripts({ cleanup, } = { }) {
	if (typeof (cleanup = cleanup || (() => void 0)) !== 'function') { throw new TypeError('"Cleanup" paramter must be a function or falsey'); }

	return Tabs.query({ }).then(tabs => {
		return Promise.all(chrome.runtime.getManifest().content_scripts.map(({ js, css, matches, exclude_matches, }) => {
			const includes = (matches || [ ]).map(pattern => pattern === '<all_urls>' ? (/./) : matchPatternToRegExp(pattern));
			const excludes = (exclude_matches || [ ]).map(matchPatternToRegExp);
			return Promise.all(tabs.map(({ id, url, }) => {
				if (!url || !includes.some(exp => exp.test(url)) || excludes.some(exp => exp.test(url))) { return; }
				return Tabs.executeScript(id, { code: `(${ cleanup })();`, })
				.then(() => {
					css && css.forEach(file => chrome.tabs.insertCSS(id, { file, }));
					js && js.forEach(file => chrome.tabs.executeScript(id, { file, }));
					return true;
				})
				.catch(error => console.log('skipped tab', error)); // not allowed to execute
			})).then(_=>_.filter(_=>_).length);
		}));
	});
}

return {
	matchPatternToRegExp,
	attachAllContentScripts,
};

});
