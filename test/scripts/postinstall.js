'use strict';

const FS = require('fs'), Path = require('path'), { promisify, } = require('util');
const access = promisify(FS.access), symlink = promisify(FS.symlink), unlink = promisify(FS.unlink);
const lib = path => Path.resolve(__dirname, '../../lib', path);

Promise.all([ 'pbq', 'multiport', ].map(module =>
	Promise.all([ find(module), unlink(lib(module)).catch(() => null), ])
	.then(([ from, ]) => symlink(from, lib(module), 'junction'))
)).catch(error => {
	console.error(error);
	process.exit(1);
});

function find(name) {
	return module.paths.reduce((prev, path) => prev.then(found => found
		|| access(path +'/'+ name).then(() => path +'/'+ name, () => null)
	), Promise.resolve(null));
}
