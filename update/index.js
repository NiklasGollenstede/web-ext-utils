(() => { 'use strict'; define(function*({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../chrome/': { extension, runtime, Storage, },
}) {

const Version = createVersionClass();

const manifest = runtime.getManifest();

// load options
const options = manifest.run_update;
if (typeof options !== 'object') { throw new Error(`The manifest.json entry "run_update" must be an object`); }
const { base_path = 'update/', history_epsilon = 'day', } = options;
const currentDate = circaDate(history_epsilon);

// load data
const getJson    = loadFile('versions.json');
const getLocal   = Storage.local.get([ '__update__.local.version', '__update__.history', ]);
const getSync    = Storage.sync.get([ '__update__.sync.version', ]);
const last       = new Version((yield getLocal)['__update__.local.version']);
const synced     = new Version((yield getSync)['__update__.sync.version']);
const history    = (yield getLocal)['__update__.history'] || [ ];
const now        = new Version(manifest.version);
const arg        = { from: last, to: now, synced, };
const updated    = Object.assign([ ], arg, { history, });

if (last === now) { return updated; } // no update
if (last > now) { // downgrade
	console.error(`Version was downgraded from ${ last } to ${ now }`);
	updated.downgraded = true;
	return updated;
}

const versions = JSON.parse((yield getJson) || '[]').map(Version.create).sort(numeric);

if (+last === 0) { // newly installed
	(yield runStep('installed', now)) && (updated.installed = true);
} else { // incremental updates
	const startAt = versions.findIndex(_=>_ > last);
	for (let version of versions.slice(startAt > 0 ? startAt : Infinity)) {
		(yield runStep(version, version)) && updated.push(version);
	}
}

// finishing steps
(yield runStep('updated', now)) && (updated.updated = true);
(yield runStep('started', now)) && (updated.started = true);

// write the new version
currentDate && history.push({ version: now +'', date: currentDate, });
(yield Promise.all([
	Storage.local.set({ '__update__.local.version': now +'', '__update__.history': history, }),
	now > synced && Storage.sync.set({ '__update__.sync.version': now +'', }),
]));

// done
return updated;

/// does one step of the update process, returns true iff the step ran successfully
function runStep(file, version) {
	const printError = error => void console.error(`Update step for file "${ file  +'.js' }" failed with`, error);
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.return = resolve;
		script.onload = () => setTimeout(resolve);
		script.onerror = reject;
		script.src = extension.getURL(base_path + file +'.js');
		document.documentElement.appendChild(script).remove();
	})
	.catch(error => error instanceof Error && printError(error))
	.then(step => typeof step === 'function' && Promise.resolve(step(Object.assign({ now: version, }, arg))).then(() => true))
	.catch(printError);
}

/// loads a file from the update folder as a string or null
function loadFile(name) {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest;
		xhr.addEventListener('load', () => resolve(xhr.responseText));
		xhr.addEventListener('error', () => resolve(null));
		xhr.open('GET', extension.getURL(base_path + name));
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

function circaDate(eps) {
	if (eps === false) { return 0; }
	if (typeof eps === 'number' && eps > 0) { return Math.floor(Date.now() / eps) * eps || 0; }
	const date = new Date;
	switch (eps) {
		case 'day':    date.setHours(0);   /* falls through */
		case 'hour':   date.setMinutes(0); /* falls through */
		case 'minute': date.setSeconds(0); /* falls through */
		case 'second': date.setMilliseconds(0);
		break;
		default: throw new Error(`Invalid value for "history_epsilon": ${ eps } (${ typeof eps })`);
	}
	return +date;
}

}); })();
