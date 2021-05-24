(function(global) { 'use strict'; const factory = function webExtUtils_about(exports) { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Prints the version and contributions information of the extension to an HTML element.
 * @param  {object}   options
 * @param  {Element}  options.host      The DOM element to which the about section should be written.
 * @param  {object}   options.manifest  Optional. An object, e.g. `runtime.getManifest()` containing
 *                                      the `title` || `name`, `version`, `author`, `contributors`, `repository` and `license` keys from the manifest.json or package.json.
 *                                      `contributions` can be an Array listing external contributions as { what, who, license, }, of which each is an object of { name, url, [email, ], } or a string.
 *                                      Defaults to `runtime.getManifest()`.
 * @param  {object}   options.browser   Optional. An object of { name, version, } describing the current browser.
 */
function About({
	host,
	manifest = (global.browser || global.chrome).runtime.getManifest(),
	package: packageJson = null,
	browser = null,
} = /**@type{any}*/({ })) {

	const $ = createElement.bind(host.ownerDocument.defaultView);
	const makeLink = entry => entry.url ? $('a', { href: entry.url, target: '_blank', }, [ entry.name || entry.url, ]) : entry.name || entry;
	const makePerson = entry => {
		let { name, url, email, } = entry;
		if (typeof entry === 'string') {
			[ , name, url, email, ] = (/(.*?)(?:\s*[<](.*?)[>])?(?:\s*\((.*?)\))?\s*$/).exec(entry) || [ '', entry, ];
		}
		if (!name) { name = url || email; }
		return $('span', { className: 'person', }, [
			!email && !url && name,
			url && $('a', { href: url, target: '_blank', }, [ name, ]),
			email && !url && $('a', { href: 'mailto:'+ email, target: '_blank', }, [ name, ]),
			email && url && [ ' ', $('a', { href: 'mailto:'+ email, target: '_blank', }, [ '✉', ]), ],
		]);
	};
	const addCommas = array => array.reduce((result, value) => ((result.push(value, ', ')), result), [ ]).slice(0, -1);

	host.classList.add('about-host');

	const license = manifest.license || packageJson && packageJson.license;
	const repo = manifest.repository || packageJson && packageJson.repository;
	const contributions = manifest.contributions || packageJson && packageJson.contributions;

	[
		$('h2', [ 'About ', manifest.name, ]),
		$('ul', [
			$('li', { className: 'version', }, [
				'Version: ', manifest.version,
			]),
			$('li', { className: 'author', }, [
				'Author: ', makePerson(manifest.author),
			]),
			// TODO: contributors
			license && $('li', { className: 'license', }, [
				'License: ', license, ' ', $('a', { href: '/LICENSE', target: '_blank', }, 'full text'),
			]),
			repo && $('li', { className: 'repository', }, [
				'Repository: ', $('a', { href: repo.url || repo, target: '_blank', }, [
					repo.title || typeof repo.type === 'string' && repo.type.toUpperCase() || repo.url,
				]),
			]),
			browser && $('li', { className: 'browser', }, [
				'Browser: ', browser.name, ' ', browser.version,
			]),
		]),
		contributions && contributions.length && $('h3', null, 'Contributions'),
		contributions && contributions.length && $('ul', contributions.map(({ what, who, license, }) => $('li', [
			makeLink(what),
			who ? [ ' by ', Array.isArray(who) ? addCommas(who.map(makePerson)) : makePerson(who), ] : [ ],
			license ? [ ' (', makeLink(license), ')', ] : [ ],
		]))),
	].forEach(child => child && host.appendChild(child));

}

/**
 * Creates a DOM Element and sets properties/attributes and children.
 * @param  {string}          tagName     Type of the new Element to create.
 * @param  {object}          properties  Optional. Object (not Array) of properties, which are deeply copied onto the new element.
 * @param  {Array<Element>}  childList   Optional. Array of elements or strings (as Text nodes) to set as the children of the new element.
 *                                       Nested Arrays are recursively flattened, falsy values are ignored.
 * @return {Element}                     The new DOM element.
 */
function createElement(tagName, properties, childList) {
	const window = this || global; // eslint-disable-line no-invalid-this
	const element = window.document.createElement(tagName);
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
		if (Array.isArray(child)) { child.forEach(/**@type{any}*/(append)); return; }
		child && element.appendChild(typeof child === 'string' ? window.document.createTextNode(child) : child);
	})(childList);
	return element;
}

return About;

}; if (typeof define === 'function' && define.amd) { define([ 'exports', ], factory); } else { const exp = { }, result = factory(exp) || exp; if (typeof exports === 'object' && typeof module === 'object') { module.exports = result; } else { global[factory.name] = result; } } })((function() { return this; })()); // eslint-disable-line
