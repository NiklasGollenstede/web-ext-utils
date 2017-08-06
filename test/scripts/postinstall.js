'use strict';

const FS = require('fs-extra');
const Path = require('path');
const lib = path => Path.resolve(__dirname, '../../lib', path);

Promise.all([ 'pbq', 'multiport', ].map(module =>
	Promise.all([ find(module), FS.unlink(lib(module)).catch(() => null), ])
	.then(([ from, ]) => FS.ensureSymlink(from, lib(module), 'junction'))
)).catch(error => {
	console.error(error);
	process.exit(1);
});

function find(name) {
	return module.paths.reduce((prev, path) => prev.then(found => found
		|| FS.pathExists(path +'/'+ name).then(_=>_ ? path +'/'+ name : null)
	), Promise.resolve(null));
}
