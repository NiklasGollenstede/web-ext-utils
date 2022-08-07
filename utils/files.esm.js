// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

const files = (await (await globalThis.fetch('/files.json')).json());

const browser = (/**@type{any}*/(globalThis).browser || globalThis.chrome);

function split(path) {
	const parts = path.split(/\/|\\/g);
	for (
		let i = 0;
		i < parts.length;
		parts[i] === '.' || parts[i] === '' ?
		parts.splice(i, 1)
		: parts[i] === '..' && i > 0 && parts[i -1] !== '..' ?
		parts.splice(--i, 2)
		: ++i
	) { void 0; }
	return parts;
}

function find(parts) {
	let node = files;
	for (const part of parts) { node = node && node[part]; }
	return node;
}

function resolve(...fragments) {
	return split(fragments.join('/')).join('/');
}

function exists(path) {
	return !!find(split(path));
}

function readDir(path) {
	const dir = find(split(path));
	if (dir && typeof dir === 'object') { return Object.keys(dir); }
	throw new Error(`"${ path }" is not a directory`);
}

function stat(path) {
	const node = find(split(path));
	return {
		isFile() { return node === true; },
		isDirectory() { return typeof node === 'object'; },
	};
}

/**
 * Loads a file included in the extension.
 * @param  {string}  path      Absolute path of the file to read.
 * @param  {string}  encoding  Optional. Allowed values: 'utf-8'
 * @return {Promise<string|ArrayBuffer>}  The file's content.
 */
async function readFile(path, encoding) {
	const url = browser.runtime.getURL(path);

	return new Promise((resolve, reject) => {
		const xhr = new globalThis.XMLHttpRequest;
		xhr.responseType = encoding == null ? 'arraybuffer' : 'text';
		xhr.addEventListener('load', () => resolve(xhr.response));
		xhr.addEventListener('error', reject);
		xhr.open('GET', url);
		xhr.send();
	});
}

export default {
	exists,
	readdir: readDir, readDir,
	readFile,
	resolve,
	stat,
};
