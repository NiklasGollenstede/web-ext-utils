/*eslint strict: ["error", "global"], no-implicit-globals: "off"*/ 'use strict'; /* globals require, describe, it, assert, */ // license: MPL-2.0
/// @ts-nocheck

const file = require('fs').readFileSync('utils/index.js', 'utf8').split((/\r?\n|\r/g)).slice(4, -3).join('\n');

const { matchPatternToRegExp, } = eval(`(() => { ${ file } })();`);

const tests =
/*
// The result of the script below executed on `https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Match_patterns` if the root of the ``Examples`` table is selected ($0)

JSON.stringify(Array.prototype.map.call($0.querySelector('tbody').querySelectorAll('tr'), row => {
	const [ first, second, third, ] = row.children;
	return {
		pattern: first.querySelector('code').textContent.trim(),
		desc: first.querySelector('p:last-child').textContent.trim(),
		good: Array.prototype.map.call(second.querySelectorAll(':scope>*'), entry => ({
			test: entry.textContent.trim(),
		})),
		bad: Array.prototype.map.call(third.querySelectorAll(':scope>p'), entry => ({
			test: entry.querySelector('code').textContent.trim(),
			desc: entry.childNodes[entry.childNodes.length - 1].textContent.trim(),
		})),
	};
}), null, '\t').replace(/"([\$a-z\_]\w*)":/g, '$1:').replace(/\}\,\s+\{/g, '}, {') +';';

 */
[ /* eslint-disable comma-dangle */
	{
		pattern: "<all_urls>",
		desc: "Match all URLs.",
		good: [
			{
				test: "http://example.org/"
			}, {
				test: "ftp://files.somewhere.org/"
			}, {
				test: "https://a.org/some/path/"
			}
		],
		bad: [
			{
				test: "resource://a/b/c/",
				desc: "(unsupported scheme)"
			}
		]
	}, {
		pattern: "*://*.mozilla.org/*",
		desc: "Match all HTTP and HTTPS URLs that are hosted at \"mozilla.org\" or one of its subdomains.",
		good: [
			{
				test: "http://mozilla.org/"
			}, {
				test: "https://mozilla.org/"
			}, {
				test: "http://a.mozilla.org/"
			}, {
				test: "http://a.b.mozilla.org/"
			}, {
				test: "https://b.mozilla.org/path/"
			}
		],
		bad: [
			{
				test: "ftp://mozilla.org/",
				desc: "(unmatched scheme)"
			}, {
				test: "http://mozilla.com/",
				desc: "(unmatched host)"
			}, {
				test: "http://firefox.org/",
				desc: "(unmatched host)"
			}
		]
	}, {
		pattern: "*://mozilla.org/",
		desc: "Match all HTTP and HTTPS URLs that are hosted at exactly \"mozilla.org/\".",
		good: [
			{
				test: "http://mozilla.org/"
			}, {
				test: "https://mozilla.org/"
			}
		],
		bad: [
			{
				test: "ftp://mozilla.org/",
				desc: "(unmatched scheme)"
			}, {
				test: "http://a.mozilla.org/",
				desc: "(unmatched host)"
			}, {
				test: "http://mozilla.org/a",
				desc: "(unmatched path)"
			}
		]
	}, {
		pattern: "ftp://mozilla.org/",
		desc: "Match only \"ftp://mozilla.org/\".",
		good: [
			{
				test: "ftp://mozilla.org"
			}
		],
		bad: [
			{
				test: "http://mozilla.org/",
				desc: "(unmatched scheme)"
			}, {
				test: "ftp://sub.mozilla.org/",
				desc: "(unmatched host)"
			}, {
				test: "ftp://mozilla.org/path",
				desc: "(unmatched path)"
			}
		]
	}, {
		pattern: "https://*/path",
		desc: "Match HTTPS URLs on any host, whose path is \"path\".",
		good: [
			{
				test: "https://mozilla.org/path"
			}, {
				test: "https://a.mozilla.org/path"
			}, {
				test: "https://something.com/path"
			}
		],
		bad: [
			{
				test: "http://mozilla.org/path",
				desc: "(unmatched scheme)"
			}, {
				test: "https://mozilla.org/path/",
				desc: "(unmatched path)"
			}, {
				test: "https://mozilla.org/a",
				desc: "(unmatched path)"
			}, {
				test: "https://mozilla.org/",
				desc: "(unmatched path)"
			}
		]
	}, {
		pattern: "https://*/path/",
		desc: "Match HTTPS URLs on any host, whose path is \"path/\".",
		good: [
			{
				test: "https://mozilla.org/path/"
			}, {
				test: "https://a.mozilla.org/path/"
			}, {
				test: "https://something.com/path/"
			}
		],
		bad: [
			{
				test: "http://mozilla.org/path/",
				desc: "(unmatched scheme)"
			}, {
				test: "https://mozilla.org/path",
				desc: "(unmatched path)"
			}, {
				test: "https://mozilla.org/a",
				desc: "(unmatched path)"
			}, {
				test: "https://mozilla.org/",
				desc: "(unmatched path)"
			}
		]
	}, {
		pattern: "https://mozilla.org/*",
		desc: "Match HTTPS URLs only at \"mozilla.org\", with any path.",
		good: [
			{
				test: "https://mozilla.org/"
			}, {
				test: "https://mozilla.org/path"
			}, {
				test: "https://mozilla.org/another"
			}, {
				test: "https://mozilla.org/path/to/doc"
			}
		],
		bad: [
			{
				test: "http://mozilla.org/path",
				desc: "(unmatched scheme)"
			}, {
				test: "https://mozilla.com/path",
				desc: "(unmatched host)"
			}
		]
	}, {
		pattern: "https://mozilla.org/a/b/c/",
		desc: "Match only this URL.",
		good: [
			{
				test: "https://mozilla.org/a/b/c/"
			}
		],
		bad: []
	}, {
		pattern: "https://mozilla.org/*/b/*/",
		desc: "Match HTTPS URLs hosted on \"mozilla.org\", whose path contains a component \"b\" somewhere in the middle.",
		good: [
			{
				test: "https://mozilla.org/a/b/c/"
			}, {
				test: "https://mozilla.org/d/b/f/"
			}, {
				test: "https://mozilla.org/a/b/c/d/"
			}
		],
		bad: [
			{
				test: "https://mozilla.org/b/*/",
				desc: "(unmatched path)"
			}, {
				test: "https://mozilla.org/a/b/",
				desc: "(unmatched path)"
			}
		]
	}, {
		pattern: "file:///blah/*",
		desc: "Match any FILE URL whose path begins with \"blah\".",
		good: [
			{
				test: "file:///blah/"
			}, {
				test: "file:///blah/bleh"
			}
		],
		bad: []
	}
];


describe('The `matchPatternToRegExp` of', () => {
	tests.forEach(test => {
		const exp = matchPatternToRegExp(test.pattern);
		it(`'${ test.pattern }' should ${ test.desc.replace((/^./), c => c.toLowerCase()) }`, () => {
			test.good.forEach(({ test, }) => assert(exp.test(test), `${ exp } should match '${ test }'`));
			test.bad.forEach(({ test, desc, }) => assert(!exp.test(test), `${ exp } should mismatch '${ test }' ${ desc }`));
		});
	});
});
