(function(global) { 'use strict'; define(async ({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	exports,
}) => {

function setEvent(target, name, { init, lazy = true, async = false, writeable = false, once = false, } = { }) {
	let done = false, all = init ? new Set(typeof init === 'function' ? [ init, ] : init) : null;
	function get() {
		const event = (function(it, o) {
			event.addListener(it) && o && o.owner && o.owner.addEventListener('unload', () => event.removeListener(it));
		}).bind();
		Object.defineProperty(event, 'name', { value: name, });
		return Object.assign(event, {
			addListener(it) { return !(done || all || (all = new Set)) && typeof it === 'function' && all.add(it); },
			hasListener(it) { return all && all.has(it); },
			removeListener(it) { return all && all.delete(it); },
		});
	}

	Object.defineProperty(target, name, lazy
		? { get, set: writeable ? value => Object.defineProperty(target, name, value) : undefined, enumerable: true, configurable: true, }
		: { value: get(), writeable, enumerable: true, configurable: true, }
	);

	return async function fire(args, { last = once, } = { }) {
		if (done) { return; } if (async) { (await null); }
		const ready = all && Promise.all(Array.from(all, async listener => { try { await listener(...args); } catch (error) { console.error(error); } }));
		if (last) { all.clear(); all = null; done = true; }
		(await ready);
	};
}

exports.setEvent = setEvent;

}); })(this);
