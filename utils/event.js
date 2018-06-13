(function(global) { 'use strict'; define(() => { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Interface `Event`:
 * "An [interface] which allows the addition and removal of listeners for an [...] event." -- MDN
 *
 * In addition to the WebExtension `events.Event` interface, the `add` and `remove` functions
 * return a boolean whether any action was taken, and the `Event` is a function itself,
 * that adds a listener with additional options:
 * @param  {function}  listener  Listener to add/test/remove. Adding an existing or removing a non-existing listener is a no-op.
 * @param  {boolean?}  .once     If `true` the listener will be removed right before it is called the first time.
 * @param  {Window?}   .owner    A `Window` global object that "owns" this listener. The listener will be removed when the owners "unload" event fires.
 * @return {boolean|any}         `false` if the listener is not a function or was already added, or if the event is dead.
 *                               Otherwise `true`, or a truthy value specific to the event type.
 *
 * The methods on that function have the same interface as the `events.Event` interface:
 * @method  addListener(fn)     If called with a not-yet-added function on a living `Event`,
 *                              adds that listener to the event and returns `true`, returns `false` otherwise.
 * @method  hasListener(fn)     Returns `true` if `fn` is added as listener, `false` otherwise.
 * @method  removeListener(fn)  Returns `hasListener(fn)` and removes the listener `fn`.
 */


/**
 * Defines an `Event` as a property on an object and returns a function to fire it.
 * @param  {object}     target      The object to define the `Event` on.
 * @param  {string}     name        Property name and function `.name` of the event.
 * @param  {function?}  .init       Function or iterable of functions as initial listeners.
 * @param  {boolean?}   .async      Whether to fire the event asynchronously after the call to `fire`. Defaults to `false`.
 * @param  {boolean?}   .writeable  Whether to define the event as writable property. Defaults to `false`.
 * @param  {boolean?}   .once       Whether the first call to `fire` is also the last. Defaults to `false`.
 * @return {function}               Async function to call to `fire` the event:
 *
 * Errors thrown by the listeners are logged. Arguments to `fire`:
 * @param  {iterable?}  args        Iterable of arguments for the listeners. Skips firing if `null`.
 * @param  {boolean?}   .last       Whether to destroy the `Event` after firing. Defaults to `.once`.
 * @param  {function?}  .filter     Optional function(listener) that may filter the listeners to be called.
 * @return {natural}                The number of called listeners that did not throw (or reject).
 * The `fire` function has the following additional properties:
 * @property {number}     size      Getter that returns the current number of listeners.
 * @property {function?}  onadd     Function that, if set, is called with every added listener ands its optional options.
 * @property {function?}  onremove  Function that, if set, is called with every removed listener.
 */
function setEvent(target, name, { init, async: _async = false, writeable = false, once = false, } = { }) {
	let all = init ? new Map(typeof init === 'function' ? [ [ init, null, ], ] : Array.from(init, f => [ f, null, ])) : new Map;

	const event = (function(it, options) {
		if (!all || typeof it !== 'function' || all.has(it)) { return false; }
		if (options) {
			const { owner = null, once = false, } = options, ctx = { owner, once, handleEvent: null, };
			if (owner) { ctx.handleEvent = () => event.removeListener(it); owner.addEventListener('unload', ctx); }
			all.set(it, ctx);
		} else { all.set(it); }
		return typeof fire.onadd === 'function' && fire.onadd(it, options) || true;
	}).bind();
	Object.defineProperty(event, 'name', { value: name, });
	Object.assign(event, {
		addListener(it) { return event(it, null); },
		hasListener(it) { return all && all.has(it); },
		removeListener(it) {
			if (!all || !all.has(it)) { return false; }
			const ctx = all.get(it); ctx && ctx.owner && ctx.owner.removeEventListener('unload', ctx);
			typeof fire.onremove === 'function' && fire.onremove(it);
			return all.delete(it);
		},
	});
	Object.defineProperty(target, name, { value: event, writeable, enumerable, configurable, });

	async function fire(args, options) {
		if (!all) { return 0; } if (_async) { (await null); }
		const ready = args !== null && Promise.all(Array.from(
			all // must create a slice if the map before calling the handlers, otherwise any additional handlers added will catch this event
		).map(async ([ listener, ctx, ]) => {
			ctx && ctx.once && event.removeListener(listener);
			if (options && options.filter && !options.filter(listener)) { return false; }
			try { (await listener(...args)); return true; }
			catch (error) { console.error(`${name} listener threw`, error); return false; }
		}));
		if (options && options.last != null ? options.last : once) { all.clear(); all = false; }
		return !ready ? 0 : (await ready).reduce((c, b) => b ? c + 1 : c, 0);
	}

	Object.defineProperty(fire, 'size', { get() { return all ? all.size : 0; }, enumerable, configurable, });
	fire.onadd = fire.onremove = null;
	return fire;
}

/**
 * Defines an `Event` as a class prototype property. The event will be available as non-configurable getter
 * `on<name>` on the prototype (like getters defined in a class literal).
 * The backing `Event` instance will be created on first access and is stored on the mapped private object
 * as `on<name>` (see `Self`); the `fire` function is stored on the same object as `fire<name>`.
 * Usage example:
 *     const Self = new WeakMap;
 *     class Class {
 *         constructor() { Self.set(this, { }); }
 *         fire() { const self = Self.get(this); self.fireEvent && self.fireEvent([ ...arguments, ]); }
 *     }
 *     setEventGetter(Class, 'event', Self);
 *     const instance = new Class;
 *     instance.fire('nothing'); // no-op, self.fireEvent not defined yet
 *     instance.onEvent.addListener(thing => console.log('hello', thing));
 *     instance.fire('world'); // logs 'hello world'
 * @param  {function}  Class   Constructor function on whose prototype the event getter will be defined.
 * @param  {string}    name    Name of the event. The first letter will be capitalized and prefixed with 'on'/'fire'.
 * @param  {WeakMap}   Self    A WeakMap that maps valid instances of `Class` to private objects.
 *                             Invoking the getter on objects that are not keys in the map will throw.
 *                             (Specifically, a object with a `get()` method that takes instances and returns objects.)
 * @param  {boolean}   .async  Forwarded as `setEvent(..., { async, })`.
 * @param  {boolean}   .once   Forwarded as `setEvent(..., { once, })`.
 */
function setEventGetter(Class, name, Self, { async: _async = false, once = false, } = { }) {
	name =  name.replace(/^./, _=>_.toUpperCase()); const on = 'on'+ name, fire = 'fire'+ name;
	return Object.defineProperty(Class.prototype, on, { get() {
		const self = Self.get(this); if (self[on]) { return self[on]; }
		self[fire] = setEvent(self, on, { async: _async, once, });
		return self[on];
	}, configurable, });
}

const enumerable = true, configurable = true;

return {
	setEvent,
	setEventGetter,
};

}); })(this);
