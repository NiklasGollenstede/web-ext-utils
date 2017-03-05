(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
}) => {

const browser = (global.browser || global.chrome);

const files = JSON.parse((await readFile('files.json', 'utf-8')));

function split(path) {
	const parts = path.split(/\/|\\/g);
	for (
		let i = 0;
		i < parts.length;
		parts[i] === '.' ?
		parts.splice(i, 1)
		: parts[i] === '..' && i > 0 && parts[i -1] !== '..' ?
		parts.splice(--i, 2)
		: ++i
	) { void 0; }
	return parts;
}

function find(path) {
	let node = files; const parts = split(path);
	for (const part of parts) { node = node[part]; }
	return node;
}

function resolve(...fragments) {
	return split(fragments.join('/')).join('/');
}

function exists(path) {
	try { return !!find(path); } catch (_) { return false; }
}

function readDir(path) { try {
	const dir = find(path);
	if (!dir || dir === true) { throw null; } // eslint-disable-line no-throw-literal
	return Object.keys(dir);
} catch (_) {
	throw new Error(`"${ path }" is not a directory`);
} }

async function stat(path) {
	const node = find(path);
	return {
		isFile() { return node === true; },
		isDirectory() { return typeof node === 'object'; },
	};
}

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
	exists,
	readdir: readDir, readDir,
	readFile,
	resolve,
	stat,
};

}); })(this);
