(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'module!../browser/': { manifest, storage: _Storage, },
	'module!../browser/storage': Storage,
	'module!../browser/version': { current: currentBrowser, version: browserVersion, },
	'../utils/semver': Version,
	'module!../utils/files': { readDir, },
	require,
}) => {

let inProgress = { version: null, component: null, };

// load data
// const getLocal   = Storage.local.get([ `__update__.local.version`, `__update__.${ currentBrowser }.version`, ]);
// const getSync    = Storage.sync !== Storage.local ? Storage.sync.get([ '__update__.sync.version', ]) : { '__update__.sync.version': null, };

const extension  = ({ from: new Version(Storage.local.get(`__update__.local.version`)),               to: new Version(manifest.version), });
const browser    = ({ from: new Version(Storage.local.get(`__update__.${ currentBrowser }.version`)), to: new Version(browserVersion), });
const synced     = ({ from: new Version(Storage.sync .get(`__update__.sync.version`)),                to: new Version(_Storage.sync !== _Storage.local ? manifest.version : null), });
const _updated   = ({ extension, browser, synced, });

for (const component of Object.keys(_updated)) {
	const updated = _updated[component];
	const path = component === 'browser' ? currentBrowser : component;

	define('update/' + path +'/current', {
		get component() { return component; },
		get from     () { return updated.from; },
		get to       () { return updated.to; },
		get now      () { return inProgress.component === component ? inProgress.version : null; },
	});
}

for (const [ component, updated, ] of Object.entries(_updated)) {
	const { from: last, to: now, } = updated;
	inProgress.component = component;

	const path = component === 'browser' ? currentBrowser : component;

	if (last === now || now === Version.invalid) {
		// no update / no current version
		Object.freeze(updated); continue;
	}
	if (last > now) {
		// downgrade
		component !== 'browser' && console.error(`${ path } version was downgraded from ${ last } to ${ now }`);
		updated.downgraded = true;
		Object.freeze(updated); continue;
	}

	let _versions; try {
		_versions = readDir('update/'+ path).filter(_=>_.endsWith('.js')).map(_=>_.slice(0, -3));
	} catch(_) { _versions = [ ]; }
	const hasInstalled = _versions.includes('installed');
	const hasUpdated   = _versions.includes('updated');

	if (last === Version.invalid) {
		// newly installed
		if (hasInstalled && (await runStep(path +'/installed', now))) {
			updated.installed = true;
		}
	} else {
		// incremental updates
		hasInstalled && _versions.splice(_versions.indexOf('installed'), 1);
		hasUpdated   && _versions.splice(_versions.indexOf('updated'),   1);
		const versions = _versions.map(Version.create).sort(numeric);
		const ran = updated.ran = [ ];
		for (const version of versions) {
			if (version <= last || version > now) { continue; }
			if ((await runStep(path +'/'+ version, version))) {
				ran.push(version);
			}
		}
		Object.freeze(ran);

		if (hasUpdated && (await runStep(path +'/updated', now))) {
			updated.updated = true;
		}
	}

	// write the new version
	switch (component) {
		case 'extension': Storage.local.set(`__update__.local.version`,               now +''); break;
		case 'browser'  : Storage.local.set(`__update__.${ currentBrowser }.version`, now +''); break;
		case 'synced'   : Storage.sync .set(`__update__.sync.version`,                now +''); break;
	}

	Object.freeze(updated);
}

// done
inProgress = { version: null, component: null, };
return Object.freeze(_updated);

/// does one step of the update process, returns true iff the step ran successfully
function runStep(file, version) {
	inProgress.version = version;
	return require.async('update/' + file).then(() => true)
	.catch(error => void console.error(`Update step for file "${ file  +'.js' }" failed with`, error));
}

/// numeric sorter
function numeric(a, b) { return a - b; }

}); })(this); // eslint-disable-line no-invalid-this
