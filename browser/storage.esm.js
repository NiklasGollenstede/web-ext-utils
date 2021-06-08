// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

import Browser from './index.esm.js'; const { storage: Async, } = Browser;
import { setEvent, } from 'web-ext-event';

/**
 * @exports
 * @typedef {object} CachedStorageArea - Cached StorageArea
 * @property {(key: string) => any} get
 * @property {(key: string, value: any, ref?: any) => Promise<void>} set
 * @property {(key: string|string[], ref?: any) => Promise<void>} remove
 * @property {(key: string|string[], ref?: any) => Promise<void>} delete
 * @property {(ref?: any) => Promise<void>} clear
 * @property {(callbackfn: (value: [ string, any, ], index: number) => void, thisArg?: any) => void} forEach
 * @property {{ [s: string]: any, }} proxy
 * @property {import('web-ext-event').Event<[ key: string, newVal: any, oldVal: any, ref?: any, ]>} onChanged
 * @property {Promise<void>} ready
 */

/**
 * Wraps the `.local` and `.sync` `browser.storage` with the following changes:
 * * `.get()` is synchronous and reads values from a write-through in-memory cache.
 * * `.set()` can be called with (key, value), `.delete()` as alias for `.remove()` (Map interface).
 * Modifications are applied to the cache immediately and return Promises for their backend completion.
 * Any values to be set must be JSON values and will be deeply frozen and written to the cache,
 * so getting the same key afterwards may return the exact same object (`===`).
 * Each individual StorageArea has an `.onChanged` `utils/event.js` Event,
 * that fires for each property with (key, value, old) only if the JSON representation of value changed.
 * `.proxy` provides a writable object view of the storage data.
 */
const storage = { local: /**@type{CachedStorageArea}*/(null), sync: /**@type{CachedStorageArea}*/(null), };
/**@typedef {{ data: { [s: string]: any, }, onChanged: import('web-ext-event').EventTrigger<[ key: string, newVal: any, oldVal: any, ref?: any, ]>, }} Internal */
const internal = { local: /**@type{Internal}*/(null), sync: /**@type{Internal}*/(null), };

(/* await Promise.all */([ 'local', 'sync', ].map(/* async */ (/**@type{'local'|'sync'}*/type) => {
	const async = Async[type];
//	let data = (await async.get());	if (Array.isArray(data) && data.length === 1) { data = data[0]; } // some weird Firefox bug (2016-12)
//	data = Object.assign(Object.create(null), data); Object.values(data).forEach(deepFreeze);

	// this is less efficient than the two lines commented out above, but does avoid the global await, which as of now (2021-06) is not yet supported by AMO or precinct
	// once AMO supports global await (mozilla/addons-linter#3741), this can be switched back
	// should precinct still not support it, dig out the dependency hack again ...
	const data = /**@type{Record<string, any>}*/(Object.create(null));
	const ready = async.get().then(values => {
		if (Array.isArray(values) && values.length === 1) { values = values[0]; } // some weird Firefox bug (2016-12)
		Object.entries(values).forEach(([ key, value, ]) => setValue(type, key, value));
	});

	function get(/**@type{string}*/key) { return data[key]; }
	async function set(key, value, ref) { let update; if (typeof key !== 'object' || key === null) {
		if (value !== undefined && !deepEquals(data[key], value))
		{ onChanged([ key, value, data[key], ref, ]); data[key] = deepFreeze(value); }
		update = { [key]: value, };
	} else { ref = value; update = key; Object.entries(update).forEach(([ key, value, ]) => {
		if (value !== undefined && !deepEquals(data[key], value))
		{ onChanged([ key, value, data[key], ref, ]); data[key] = deepFreeze(value); }
	}); } return void (await async.set(update)); }
	function remove(/**@type{string|string[]}*/key, ref) { if (typeof key === 'string') {
		delete data[key] && onChanged([ key, undefined, data[key], ref, ]);
	} else { key.forEach(key => {
		delete data[key] && onChanged([ key, undefined, data[key], ref, ]);
	}); } return async.remove(key); }
	function clear(ref) { Object.keys(data).forEach(key => {
		delete data[key] && onChanged([ key, undefined, data[key], ref, ]);
	}); return async.clear(); }

	storage[type] = {
		get, set, delete: remove, clear,
		forEach(cb, ta) { Object.entries(data).forEach(cb, ta); },
		remove, proxy: new Proxy(data, {
			set(_, key, value) { set(key, value); return true; },
			deleteProperty(_, /**@type{string}*/key) { const had = delete data[key]; remove(key); return had; },
		}), onChanged: null,
		ready,
	}; internal[type] = { data, onChanged: null, };
	/**@type{Internal['onChanged']}*/ const onChanged = internal[type].onChanged = setEvent(storage[type], 'onChanged', { async: true, });
})));

Async.onChanged.addListener((changes, type) => Object.entries(changes).forEach(([ key, { newValue: value, }, ]) => setValue(/**@type{'local'|'sync'}*/(type), key, value)));

function setValue(/**@type{'local'|'sync'}*/type, /**@type{string}*/key, /**@type{any}*/value) {
	const current = internal[type].data[key];
	if (deepEquals(current, value)) { return; }
	internal[type].data[key] = deepFreeze(value);
	internal[type].onChanged([ key, value, current, ]);
}

function deepEquals(/**@type{unknown}*/a, /**@type{unknown}*/b) {
	if (a === b) { return true; }
	if (typeof a !== 'object' || a === null) { return false; }
	if (Array.isArray(a)) {
		if (!Array.isArray(b) || a.length !== b.length) { return false; }
		for (let i = 0, l = a.length; i < l; ++i) {
			if (!deepEquals(a[i], b[i])) { return false; }
		} return true;
	} else {
		const ka = Object.keys(a), kb = Object.keys(b);
		if (ka.length !== kb.length) { return false; }
		for (let i = 0, l = ka.length; i < l; ++i) {
			const k = ka[i]; if (k !== kb[i]) { return false; }
			if (!deepEquals(a[k], b[k])) { return false; }
		} return true;
	}
}

function deepFreeze(/**@type{unknown}*/object) {
	const done = new WeakSet; (function doIt(object) {
		if (typeof object !== 'object' || object === null || done.has(object)) { return; }
		Object.freeze(object); done.add(object);
		Object.values(object).forEach(doIt);
	})(object); return object;
}

export default storage;
