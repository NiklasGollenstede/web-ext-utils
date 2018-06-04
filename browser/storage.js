(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'./': { storage: Async, },
	'../utils/event': { setEvent, },
}) => {
const storage = { }, internal = { };

/**
 * Wraps the `.local` and `.sync` `browser.storage` with the following changes:
 * `.get()` is synchronous and reads values from a write-through in-memory cache.
 * `.set()` can be called with (key, value), `.delete()` as alias for `.remove()` (Map interface).
 * Modifications are applied to the cache immediately and return Promises for their backend completion.
 * Any values to be set must be JSON values and will be deeply frozen and written to the cache,
 * so getting the same key afterwards may return the exact same object (`===`).
 * Each individual StorageArea has an `.onChanged` `utils/event.js` Event,
 * that fires for each property with (key, value, old) only if the JSON representation of value changed.
 * `.proxy` provides a writable object view of the storage data.
 */

(await Promise.all([ 'local', 'sync', ].map(async type => {
	const async = Async[type];
	let data = (await async.get());	if (Array.isArray(data) && data.length === 1) { data = data[0]; } // some weird Firefox bug (2016-12)
	Object.values(data).forEach(deepFreeze);

	function get(key) { return data[key]; }
	async function set(key, value, ref) { let update; if (typeof key !== 'object' || key === null) {
		if (value !== undefined && !deepEquals(data[key], value))
		{ onChanged([ key, value, data[key], ref, ]); data[key] = deepFreeze(value); }
		update = { [key]: value, };
	} else { ref = value; update = key; Object.entries(update).forEach(([ key, value, ]) => {
		if (value !== undefined && !deepEquals(data[key], value))
		{ onChanged([ key, value, data[key], ref, ]); data[key] = deepFreeze(value); }
	}); } return void (await async.set(update)); }
	function remove(key, ref) { if (typeof key === 'string') {
		delete data[key] && onChanged([ key, undefined, data[key], ref, ]);
	} else { key.forEach(key => {
		delete data[key] && onChanged([ key, undefined, data[key], ref, ]);
	}); } return async.remove(key); }
	function clear(ref) { Object.keys(data).forEach(key => {
		delete data[key] && onChanged([ key, undefined, data[key], ref, ]);
	}); return async.clear(); }

	storage[type] = {
		get, set, delete: remove, clear,
		forEach() { Object.entries(data).forEach(...arguments); },
		remove, proxy: new Proxy(data, {
			set(data, key, value) { set(key, value); },
			deleteProperty(data, key) { const had = delete data[key]; remove(key); return had; },
		}), onChanged: null,
	}; internal[type] = { data, onChanged: null, };
	const onChanged = internal[type].onChanged = setEvent(storage[type], 'onChanged', { async: true, });
})));

Async.onChanged.addListener((changes, type) => Object.entries(changes).forEach(([ key, { newValue: value, }, ]) => {
	const current = internal[type].data[key];
	if (deepEquals(current, value)) { return; }
	internal[type].data[key] = deepFreeze(value);
	internal[type].onChanged([ key, value, current, ]);
}));

function deepEquals(a, b) {
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
		for (let i = 0, l = a.length; i < l; ++i) {
			const k = ka[i]; if (k !== kb[i]) { return false; }
			if (!deepEquals(a[k], b[k])) { return false; }
		} return true;
	}
}

function deepFreeze(object) {
	const done = new WeakSet; (function doIt(object) {
		if (typeof object !== 'object' || object === null || done.has(object)) { return; }
		Object.freeze(object); done.add(object);
		Object.values(object).forEach(doIt);
	})(object); return object;
}

return storage;

}); })(this);
