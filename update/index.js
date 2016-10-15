(() => { 'use strict'; define(function*({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../chrome/': { extension: getURL, runtime, Storage, applications: { current: currentBrowser, version: browserVersion, }, },
	require,
}) {

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

const extension  = ({ from: new Version((yield getLocal)[`__update__.local.version`]),               to: new Version(manifest.version), });
const browser    = ({ from: new Version((yield getLocal)[`__update__.${ currentBrowser }.version`]), to: new Version(browserVersion), });
const synced     = ({ from: new Version((yield getSync )[`__update__.sync.version`]),                to: new Version(Storage.sync !== Storage.local ? manifest.version : null), });
const _updated   = ({ extension, browser, synced, });

for (let component of Object.keys(_updated)) {
	const updated = _updated[component];
	const path = component === 'browser' ? currentBrowser : component;

	define(base_path + path +'/current', {
		get component() { return component; },
		get from     () { return updated.from; },
		get to       () { return updated.to; },
		get now      () { return inProgress.component === component ? inProgress.version : null; },
	});
}

for (let component of Object.keys(_updated)) {
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

	const _versions = JSON.parse((yield loadFile(path +'/versions.json')) || '[]');
	const hasInstalled = _versions.includes('installed');
	const hasUpdated   = _versions.includes('updated');

	if (+last === 0 && hasInstalled) {
		// newly installed
		if ((yield runStep(path +'/installed', now))) {
			updated.installed = true;
		}
	} else {
		// incremental updates
		hasInstalled && _versions.splice(_versions.indexOf('installed'), 1);
		hasUpdated   && _versions.splice(_versions.indexOf('updated'),   1);
		const versions = _versions.map(Version.create).sort(numeric);
		const startAt = versions.findIndex(_=>_ > last);
		const ran = updated.ran = [ ];
		for (let version of versions.slice(startAt > 0 ? startAt : Infinity)) {
			if ((yield runStep(path +'/'+ version, version))) {
				ran.push(version);
			}
		}
		Object.freeze(ran);

		if (hasUpdated && (yield runStep(path +'/updated', now))) {
			updated.updated = true;
		}
	}

	// write the new version
	switch (component) {
		case 'extension': (yield Storage.local.set({ [`__update__.local.version`]:               now +'', })); break;
		case 'browser'  : (yield Storage.local.set({ [`__update__.${ currentBrowser }.version`]: now +'', })); break;
		case 'synced'   : (yield Storage.sync .set({ [`__update__.sync.version`]:                now +'', })); break;
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
	return new Promise((resolve, reject) => {
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
		const [ major, minor, patch, ] = (input || '0.0.0').split('.').concat(NaN, NaN).map(s => +s);
		const number = this.number = (major << 24) + (minor << 16) + (patch << 0);
		const string = this.string = `${ major }.${ minor }.${ patch }`;
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

}); })();
