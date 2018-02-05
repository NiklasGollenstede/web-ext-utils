(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	exports,
}) => {

function setEvent(target, name, { init, lazy = true, async: _async = false, writeable = false, once = false, } = { }) {
	let all = init ? new Map(typeof init === 'function' ? [ [ init, null, ], ] : Array.from(init, f => [ f, null, ])) : new Map;
	function get() {
		const event = (function(it, o) {
			if (!all || typeof it !== 'function' || all.has(it)) { return false; }
			const owner = o && o.owner || null; if (!owner) { return !!all.set(it); }
			const remove = () => event.removeListener(it); owner.addEventListener('unload', remove);
			return !!all.set(it, { owner, remove, });
		}).bind();
		Object.defineProperty(event, 'name', { value: name, });
		Object.assign(event, {
			addListener(it) { return all && typeof it === 'function' && !!all.set(it, null); },
			hasListener(it) { return all && all.has(it); },
			removeListener(it) {
				if (!all || !all.has(it)) { return false; }
				const o = all.get(it); o && o.owner && o.owner.removeEventListener('unload', o.remove);
				return all.delete(it);
			},
		});
		Object.defineProperty(target, name, { value: event, writeable, enumerable: true, configurable: true, });
		return event;
	}

	!lazy ? get() : Object.defineProperty(target, name, {
		get, set: writeable ? value => Object.defineProperty(target, name, { value, }) : undefined, enumerable: true, configurable: true,
	});

	return async function fire(args, { last = once, } = { }) {
		if (!all) { return 0; } if (_async) { (await null); }
		const ready = all && args && Promise.all(Array.from(
			all // must create a slice if the map before calling the handlers, otherwise any additional handlers added will catch this event
		).map(async ([ listener, ]) => {
			try { (await listener(...args)); return true; } catch (error) { console.error(`${name } listener threw`, error); return false; }
		}));
		if (last) { all.clear(); all = null; }
		return !ready ? 0 : (await ready).reduce((c, b) => b && ++c, 0);
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
