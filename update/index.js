'use strict'; define('web-ext-utils/update', [ // license: MPL-2.0
	'web-ext-utils/chrome',
], function(
	{ Storage, }
) {

const StorageSync = Storage.sync || Storage.local;

const update = ({ path = 'update/', history = 'days', } = { }) => spawn(function*() {
	const getJson = load('versions.json');
	const getLast = Storage.local.get([ '__update__.local.version', ]);
	const getSync = StorageSync.get([ '__update__.sync.version', ]);
	const last    = new Version((yield getLast)['__update__.local.version']);
	const synced  = new Version((yield getSync)['__update__.sync.version']);
	const now     = new Version(chrome.runtime.getManifest().version);

	if (last > now) {
		console.error(`Version was downgraded from ${ last } to ${ now }`);
		return Object.assign([ ], { downgraded: last, });
	}
	if (last === now) { return [ ]; } // no update

	const versions = JSON.parse((yield getJson) || '[]').map(Version.create).sort(numeric);

	const arg = { from: last, to: now, synced, };
	const ran = [ ];

	if (+last === 0) { // newly installed
		(yield runStep('installed', now)) && (ran.installed = true);
	} else { // incremental updates
		for (let version of versions.slice(versions.findIndex(_=>_ > last))) {
			(yield runStep(version, version)) && ran.push(version);
		}
	}

	// finishing step
	(yield runStep('updated', now)) && (ran.updated = true);

	// write the new version
	(yield Promise.all([
		Storage.local.set({ '__update__.local.version': now +'', }),
		history && Storage.local.set({ '__update__.history': ran.history = (yield update.getHistory()).concat({ version: now +'', date: circaDate(history), }), }),
		now > synced && StorageSync.set({ '__update__.sync.version': now +'', }),
	]));

	return ran;

	/// does one step of the update process
	function runStep(file, version) {
		const printError = error => void console.error(`Update step for file "${ file  +'.js' }" failed with`, error);
		return new Promise((resolve, reject) => {
			const script = document.createElement('script');
			script.return = resolve;
			script.onload = () => setTimeout(resolve);
			script.onerror = reject;
			script.src = chrome.extension.getURL(path + file +'.js');
			document.documentElement.appendChild(script).remove();
		})
		.catch(error => error instanceof Error && printError(error))
		.then(step => typeof step === 'function' && Promise.resolve(step(Object.assign({ now: version, }, arg))).then(() => true))
		.catch(printError);
	}

	/// loads a file from the update folder as a string or null
	function load(name) {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest;
			xhr.addEventListener('load', () => resolve(xhr.responseText));
			xhr.addEventListener('error', () => resolve(null));
			xhr.open('GET', chrome.extension.getURL(path + name));
			try { xhr.send(); } catch (_) { resolve(null); /* firefox bug */ }
		});
	}
});

update.getHistory = function() {
	return Storage.local.get([ '__update__.history', ]).then(({ '__update__.history': history, }) => history || [ ]);
};

/// normalized representation of semantic version strings, can be sorted numerically
class Version {
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
}
const versions = { };

/// numeric sorter
function numeric(a, b) { return a - b; }

function circaDate(precision) {
	const date = new Date;
	switch (precision) {
		default: case 'days': case 'day': date.setHours(0); /* falls through */
		case 'minutes': case 'minute': date.setMinutes(0); /* falls through */
		case 'seconds': case 'second': date.setSeconds(0); /* falls through */
		case 'ms': case 'milliseconds': case 'millisecond': date.setMilliseconds(0);
	}
	return +date;
}

function spawn(generator) {
	const iterator = generator();

	function next(arg) {
		return handle(iterator.next(arg));
	}
	function _throw(arg) {
		return handle(iterator.throw(arg));
	}
	function handle(result) {
		if (result.done) {
			return Promise.resolve(result.value);
		} else {
			return Promise.resolve(result.value).then(next, _throw);
		}
	}

	return Promise.resolve().then(next);
}

return update;

});
