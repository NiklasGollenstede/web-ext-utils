(function(global) { 'use strict'; const factory = function webExtUtils_about(exports) { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Prints the version and contributions information of the extension to an HTML element.
 * @param  {Element}  options.host      Optional. The element to which the about section should be written. Defaults to the `#about` element, if one exists.
 * @param  {object}   options.manifest  Optional. An object, e.g. `runtime.getManifest()` containing
 *                                      the `title` || `name`, `version`, `author`, `contributors`, `repository` and `license` keys from the manifest.json or package.json.
 *                                      `contributions` can be an Array listing external contributions as { what, who, license, }, of which each is an object of { name, url, [email, ], } or a string.
 *                                      Defaults to `runtime.getManifest()`.
 * @param  {object}   options.browser   Optional. An object of { name, version, } describing the current browser.
 */
function About({
	host = global.document.querySelector('#about'),
	manifest = (global.browser || global.chrome).runtime.getManifest(),
	package: packageJson = null,
	browser = null,
} = { }) {

	const element = createElement;
	const _ = html => element('span', { innerHTML: sanatize(html), });
	const makeLink = entry => entry.url ? element('a', { href: entry.url, target: '_blank', }, [ _(entry.name || entry.url), ]) : _(entry.name || entry);
	const makePerson = entry => {
		let { name, url, email, } = entry;
		if (typeof entry === 'string') {
			[ , name, url, email, ] = (/(.*?)(?:\s*[<](.*?)[>])?(?:\s*\((.*?)\))?\s*$/).exec(entry) || [ '', entry, ];
		}
		if (!name) { name = url || email; }
		return element('span', { className: 'person', }, [
			!email && !url && _(name),
			url && element('a', { href: url, target: '_blank', }, [ _(name), ]),
			email && !url && element('a', { href: 'mailto:'+ email, target: '_blank', }, [ _(name), ]),
			email && url && [ ' ', element('a', { href: 'mailto:'+ email, target: '_blank', }, [ '✉', ]), ],
		]);
	};
	const addCommas = array => array.reduce((result, value) => ((result.push(value, ', ')), result), [ ]).slice(0, -1);

	host.classList.add('about-host');

	const license = manifest.license || packageJson && packageJson.license;
	const repository = manifest.repository || packageJson && packageJson.repository;
	const contributions = manifest.contributions || packageJson && packageJson.contributions;

	[
		element('h2', [ 'About ', _(manifest.name), ]),
		element('ul', [
			element('li', { className: 'version', }, [
				'Version: ', manifest.version,
			]),
			element('li', { className: 'author', }, [
				'Author: ', makePerson(manifest.author),
			]),
			// TODO: contributors
			license && element('li', { className: 'license', }, [
				'License: ', license, ' ', element('a', { href: '/LICENSE', target: '_blank', }, [ 'full text', ]),
			]),
			repository && element('li', { className: 'license', }, [
				'Repository: ', element('a', { href: repository.url || repository, target: '_blank', }, [ _(repository.text || repository.type || repository.url), ]),
			]),
			browser && element('li', { className: 'browser', }, [
				'Browser: ', browser.name, ' ', browser.version,
			]),
		]),
		contributions && contributions.length && element('h3', [ 'Contributions', ]),
		contributions && contributions.length && element('ul', contributions.map(({ what, who, license, }) => element('li', [
			makeLink(what),
			who ? [ ' by ', Array.isArray(who) ? addCommas(who.map(makePerson)) : makePerson(who), ] : [ ],
			license ? [ ' (', makeLink(license), ')', ] : [ ],
		]))),
	].forEach(child => child && host.appendChild(child));

}

/**
 * Removes any tags (not their content) that are not listed in 'allowed' and any attributes except for href (not data: or javascript:) and title (order must be href, title).
 * @param  {string}  html  Untrusted HTML markup.
 * @return {[type]}        Sanitized, simple HTML.
 */
function sanatize(html) {
	const parts = (html ? html +'' : '').split(rTag);
	return parts.map((s, i) => i % 2 ? s : s.replace(rEsc, c => oEsc[c])).join('');
}
const rTag = /(&(?:[A-Za-z]+|#\d+|#x[0-9A-Ea-e]+);|<\/?(?:a|abbr|b|br|code|details|em|i|p|pre|kbd|li|ol|ul|small|spam|span|strong|summary|sup|sub|tt|var)(?: download(?:="[^"]*")?)?(?: href="(?!(?:javascript|data):)[^\s"]*?")?(?: title="[^"]*")?>)/;
const oEsc = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '/': '&#47;', };
const rEsc = new RegExp('['+ Object.keys(oEsc).join('') +']', 'g');

/**
 * Creates a DOM Element and sets properties/attributes and children.
 * @param  {string}          tagName     Type of the new Element to create.
 * @param  {object}          properties  Optional. Object (not Array) of properties, which are deeply copied onto the new element.
 * @param  {Array<Element>}  childList   Optional. Array of elements or strings (as Text nodes) to set as the children of the new element.
 *                                       Nested Arrays are recursively flattened, falsy values are ignored.
 * @return {Element}                     The new DOM element.
 */
function createElement(tagName, properties, childList) {
	const element = global.document.createElement(tagName);
	if (Array.isArray(properties)) { childList = properties; properties = null; }
	properties && (function assign(target, source) { Object.keys(source).forEach(key => {
		const value = source[key], now = target[key];
		if (typeof value === 'object' && (typeof now === 'object' || typeof now === 'function')) {
			assign(now, value);
		} else {
			target[key] = value;
		}
	}); })(element, properties);
	childList && (function append(child) {
		if (Array.isArray(child)) { child.forEach(append); return; }
		child && element.appendChild(typeof child === 'string' ? global.document.createTextNode(child) : child);
	})(childList);
	return element;
}

return About;

}; if (typeof define === 'function' && define.amd) { define([ 'exports', ], factory); } else { const exp = { }, result = factory(exp) || exp; if (typeof exports === 'object' && typeof module === 'object') { module.exports = result; } else { global[factory.name] = result; } } })((function() { return this; })()); // eslint-disable-line
