(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
}) => {

const browser = (global.browser || global.chrome);

const files = JSON.parse((await readFile('files.json', 'utf-8')));

function split(path) {
	const parts = path.split(/\/|\\/g);
	parts.forEach((part, index) => part === '..' && (parts[index] = (parts[index - 1] = '')));
	return parts.filter(_=>_ && _ !== '.');
}

function find(path) {
	let node = files; const parts = split(path);
	for (const part of parts) { node = node[part]; }
	return node;
}

function resolve(...fragments) {
	return [].concat(...fragments.map(split)).join('');
}

function exsists(path) {
	try { return !!find(path); } catch (_) { return false; }
}

function readDir(path) { try {
	const dir = find(path);
	if (!dir || dir === true) { throw null; } // eslint-disable-line no-throw-literal
	return Object.keys(dir);
} catch (_) {
	throw new Error(`"${ path }" is not a directory`);
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

}); })(this);
