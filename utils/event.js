(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	exports,
}) => {

function setEvent(target, name, { init, lazy = true, async: _async = false, writeable = false, once = false, } = { }) {
	let done = false, all = init ? new Set(typeof init === 'function' ? [ init, ] : init) : null;
	function get() {
		const event = (function(it, o) {
			const added = event.addListener(it);
			added && o && o.owner && o.owner.addEventListener('unload', () => event.removeListener(it));
			return added;
		}).bind();
		Object.defineProperty(event, 'name', { value: name, });
		Object.assign(event, {
			addListener(it) { return !done && (all || (all = new Set)) && typeof it === 'function' && !!all.add(it); },
			hasListener(it) { return all && all.has(it); },
			removeListener(it) { return all && all.delete(it); },
		});
		Object.defineProperty(target, name, { value: event, writeable, enumerable: true, configurable: true, });
		return event;
	}

	!lazy ? get() : Object.defineProperty(target, name, {
		get, set: writeable ? value => Object.defineProperty(target, name, { value, }) : undefined, enumerable: true, configurable: true,
	});

	return async function fire(args, { last = once, } = { }) {
		if (done) { return; } if (_async) { (await null); }
		const ready = all && args && Promise.all(Array.from(all, async listener => {
			try { await listener(...args); } catch (error) { console.error(`${name } listener threw`, error); }
		}));
		if (last) { all.clear(); all = null; done = true; }
		(await ready);
	};
}

function setEventGetter(Class, name, Self, { async: _async = false, once = false, } = { }) {
	name = name[0].toUpperCase() + name.slice(1); const on = 'on'+ name, fire = 'fire'+ name;
	return Object.defineProperty(Class.prototype, on, { get() {
		const self = Self.get(this); if (self[on]) { return self[on]; }
		self[fire] = setEvent(self, on, { lazy: false, async: _async, once, });
		return self[on];
	}, configurable: true, });
}

return {
	setEvent,
	setEventGetter,
};

}); })(this);
