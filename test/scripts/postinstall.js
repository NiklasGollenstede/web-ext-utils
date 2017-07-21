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

/*Promise.all([
	{ module: 'pbq/require.js', target: 'require.js', },
	{ module: 'multiport', target: 'port.js', },
].map(({ module, target, }) => FS.lstat(lib(target)).catch(() => null).then(stat => {
	if (stat && stat.isSymbolicLink()) {
		return console.log(`Keeping symlink for ${ module } in ${ lib(target) }`);
	}
	return FS.copy(require.resolve(module), lib(target));
}))).catch(error => {
	console.error(error);
	process.exit(1);
});*/
