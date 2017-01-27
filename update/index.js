(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../browser/': { runtime, Storage, applications: { current: currentBrowser, version: browserVersion, }, },
	require,
}) => {

const Version = createVersionClass();

const manifest = runtime.getManifest();
let inProgress = { version: null, component: null, };

// load options
const options = manifest.run_update;
if (typeof options !== 'object') { throw new Error(`The manifest.json entry "run_update" must be an object`); }
const base_path = (options.base_path +'' || 'update/').replace(/^\/|^\\/, '');

// load data
const getLocal   = Storage.local.get([ '__update__.local.version', '__update__.browser.version', ]);
const getSync    = Storage.sync !== Storage.local ? Storage.sync.get([ '__update__.sync.version', ]) : { '__update__.sync.version': null, };

const extension  = ({ from: new Version((await getLocal)[`__update__.local.version`]),               to: new Version(manifest.version), });
const browser    = ({ from: new Version((await getLocal)[`__update__.${ currentBrowser }.version`]), to: new Version(browserVersion), });
const synced     = ({ from: new Version((await getSync )[`__update__.sync.version`]),                to: new Version(Storage.sync !== Storage.local ? manifest.version : null), });
const _updated   = ({ extension, browser, synced, });

for (const component of Object.keys(_updated)) {
	const updated = _updated[component];
	const path = component === 'browser' ? currentBrowser : component;

	define(base_path + path +'/current', {
		get component() { return component; },
		get from     () { return updated.from; },
		get to       () { return updated.to; },
		get now      () { return inProgress.component === component ? inProgress.version : null; },
	});
}

for (const component of Object.keys(_updated)) {
	const updated = _updated[component];
	const { from: last, to: now, } = updated;
	inProgress.component = component;

	const path = component === 'browser' ? currentBrowser : component;

	if (last === now || +now === 0) {
		// no update / no current version
		Object.freeze(updated); continue;
	}
	if (last > now) {
		// downgrade
		console.error(`${ path } version was downgraded from ${ last } to ${ now }`);
		updated.downgraded = true;
		Object.freeze(updated); continue;
	}

	const _versions = JSON.parse((await loadFile(path +'/versions.json')) || '[]');
	const hasInstalled = _versions.includes('installed');
	const hasUpdated   = _versions.includes('updated');

	if (+last === 0 && hasInstalled) {
		// newly installed
		if ((await runStep(path +'/installed', now))) {
			updated.installed = true;
		}
	} else {
		// incremental updates
		hasInstalled && _versions.splice(_versions.indexOf('installed'), 1);
		hasUpdated   && _versions.splice(_versions.indexOf('updated'),   1);
		const versions = _versions.map(Version.create).sort(numeric);
		const startAt = versions.findIndex(_=>_ > last);
		const ran = updated.ran = [ ];
		for (const version of versions.slice(startAt > 0 ? startAt : Infinity)) {
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
		case 'extension': (await Storage.local.set({ [`__update__.local.version`]:               now +'', })); break;
		case 'browser'  : (await Storage.local.set({ [`__update__.${ currentBrowser }.version`]: now +'', })); break;
		case 'synced'   : (await Storage.sync .set({ [`__update__.sync.version`]:                now +'', })); break;
	}

	Object.freeze(updated);
}

// done
inProgress = { };
return Object.freeze(_updated);

/// does one step of the update process, returns true iff the step ran successfully
function runStep(file, version) {
	inProgress.version = version;
	return require.async(base_path + file).then(() => true)
	.catch(error => void console.error(`Update step for file "${ file  +'.js' }" failed with`, error));
}

/// loads a file from the update folder as a string or null
function loadFile(name) {
	return new Promise(resolve => {
		const xhr = new XMLHttpRequest;
		xhr.addEventListener('load', () => resolve(xhr.responseText));
		xhr.addEventListener('error', () => resolve(null));
		xhr.open('GET', '/'+ base_path + name);
		try { xhr.send(); } catch (_) { resolve(null); /* firefox bug */ }
	});
}

/// normalized representation of semantic version strings, can be sorted numerically
function createVersionClass(versions = { }) { return class Version {
	constructor(input) {
		const array = (/^\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:([A-Za-z_-]+)(\d*))?/).exec(input);
		if (!array) { this.number = -1; this.string = '<invalid>'; return this; }
		const major = +array[1];
		const minor = +array[2] || 0;
		const patch = +array[3] || 0;
		const channel = array[4] ? array[4][0].toLowerCase() : '';
		const build = array[4] && +array[5] || 0;
		this.number = (major * 0x1000000000) + (minor * 0x1000000) + (patch * 0x10000) + ((parseInt(channel, 36) || 36) * 0x400) + (build * 0x1);
		const string = this.string = `${ major }.${ minor }.${ patch }${ channel }${ build || '' }`;
		if (versions[string]) { return versions[string]; }
		return (versions[string] = Object.freeze(this));
	}
	[Symbol.toPrimitive](type) {
		return this.hasOwnProperty(type) ? this[type] : this.string;
	}
	static create(s) { return new Version(s); }
}; }

/// numeric sorter
function numeric(a, b) { return a - b; }

}); })(this);
