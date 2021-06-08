// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

/** @typedef {{ name: string, url?: string, email?: string, }} Person */
/** @typedef {{ title?: string, type?: string, url: string, }} Repository */
/** @typedef {{ what: string, who: string|Person|(string|Person)[], license: string, }} Contribution */

/**
 * @typedef   {object}   ManifestProperties
 * @property  {string=}  title
 * @property  {string=}  name
 * @property  {string=}  version
 * @property  {string=}  license
 * @property  {Person=}  author
 * @property  {Repository=}  repository
 * @property  {Contribution[]=}  contributions
 */

/**
 * Prints the version and contributions information of the extension to an HTML element.
 * @param  {object}               options
 * @param  {HTMLElement}          options.host      The DOM element to which the about section should be written.
 * @param  {ManifestProperties=}  options.manifest  Optional. An object, e.g. `runtime.getManifest()` containing the `title` || `name`, `version`, `author`, `contributions`, `repository` and `license` keys from the manifest.json or package.json.
 *                                      Defaults to `runtime.getManifest()`.
 * @param  {ManifestProperties=}  options.package   Optional. Fallback for values in `.manifest`.
 * @param  {{ name: string, version: string, }=}   options.browser   Optional. An object of `{ name, version, }` describing the current browser.
 */
export default function About(options) {
	const {
		host,
		manifest = /**@type{ManifestProperties}*/((/**@type{any}*/(globalThis).browser || globalThis.chrome).runtime.getManifest()),
		package: packageJson = null,
		browser = null,
	} = options || { };

	const $ = /**@type{typeof createElement}*/(createElement.bind(host.ownerDocument.defaultView));
	const makeLink = entry => entry.url ? $('a', { href: entry.url, target: '_blank', }, [ entry.name || entry.url, ]) : entry.name || entry;

	const makePerson = (/**@type{string|Person}*/entry) => {
		let { name, url, email, } = /**@type{Person}*/(entry);
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

	const license = manifest.license || packageJson?.license;
	const repo = manifest.repository || packageJson?.repository;
	const contributions = manifest.contributions || packageJson?.contributions;

	[
		$('h2', null, [ 'About ', manifest.name, ]),
		$('ul', null, [
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
		contributions && contributions.length && $('ul', null, contributions.map(({ what, who, license, }) => $('li', null, [
			makeLink(what),
			who ? [ ' by ', Array.isArray(who) ? addCommas(who.map(makePerson)) : makePerson(who), ] : [ ],
			license ? [ ' (', makeLink(license), ')', ] : [ ],
		]))),
	].forEach(child => child && host.appendChild(child));

}

/**
 * Creates a DOM Element and sets properties/attributes and children.
 * @param  {string}                  tagName     Type of the new Element to create.
 * @param  {object|null}             properties  Optional. Object (not Array) of properties, which are deeply copied onto the new element.
 * @param  {string|HTMLElement|(string|HTMLElement|(string|HTMLElement)[])[]}  childList   Optional. Elements or strings (as Text nodes) to set as the children of the new element.
 *                                               Nested Arrays are recursively flattened, falsy values are ignored.
 * @this   {Window}
 * @return {HTMLElement}                     The new DOM element.
 */
function createElement(tagName, properties, childList) {
	const window = this || globalThis.window; // eslint-disable-line no-invalid-this
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
