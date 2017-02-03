(function(global) { 'use strict'; const factory = function webExtUtils_files(exports) { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

const browser = (global.browser || global.chrome);

let files; const getFiles = readFile('files.json', 'utf-8').then(json => JSON.parse(json));

function split(path) {
	const parts = path.split(/\/|\\/g);
	parts.forEach((part, index) => part === '..' && (parts[index] = (parts[index - 1] = '')));
	return parts.filter(_=>_ && _ !== '.');
}

async function find(path) {
	if (!files) { files = (await getFiles); }
	let node = files; const parts = split(path);
	for (const part of parts) { node = node[part]; }
	return node;
}

function resolve(...fragments) {
	return [].concat(...fragments.map(split)).join('');
}

async function exsists(path) {
	try { return !!(await find(path)); } catch (_) { return false; }
}

async function readDir(path) { try {
	const dir = (await find(path));
	if (!dir || dir === true) { throw null; } // eslint-disable-line no-throw-literal
	return Object.keys(dir);
} catch (_) {
	throw new Error(`"path" is not a directory`);
} }

/**
 * Loads a file included in the extension.
 * @param  {string}  path      Absolute path of the file to read.
 * @param  {string}  encoding  Optional. Allowed values: 'utf-8'
 * @return {any}               [description]
 */
async function readFile(path, encoding) {
	const url = browser.extension.getURL(path);

	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest;
		xhr.responseType = encoding == null ? 'arraybuffer' : 'text';
		xhr.addEventListener('load', () => resolve(xhr.response));
		xhr.addEventListener('error', reject);
		xhr.open('GET', url);
		xhr.send();
	});
}

return {
	resolve,
	exsists,
	readdir: readDir, readDir,
	readFile,
};

}; if (typeof define === 'function' && define.amd) { define([ 'exports', ], factory); } else { const exp = { }, result = factory(exp) || exp; if (typeof exports === 'object' && typeof module === 'object') { /* eslint-disable */ module.exports = result; /* eslint-enable */ } else { global[factory.name] = result; } } })(this);
