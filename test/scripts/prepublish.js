'use strict';

const FS = require('fs');
const Path = require('path');

FS.readdirSync(Path.resolve(__dirname, '../../bin/')).forEach(name => {
	const path = Path.resolve(__dirname, '../../bin/'+ name);
	const file = require('fs').readFileSync(path, 'utf-8').replace(/^\uFEFF/, ''); // ignore BOM (?)

	if ((/^#!.*?\r\n/).test(file)) {
		console.error(`The bin script ${ 'bin/'+ name } contains Windows-style CRLF newlines and won't work on all systems!`);
		process.exit(1);
	}
});

