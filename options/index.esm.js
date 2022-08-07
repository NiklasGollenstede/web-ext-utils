// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { setEvent, setEventGetters, } from 'web-ext-event';
/** @typedef {[ now: Readonly<any[]>, old: Readonly<any[]>, option: Option, ]} EventArgsT */
/** @typedef {import('web-ext-event').Event<EventArgsT>} Event */
/** @typedef {import('web-ext-event').EventTrigger<EventArgsT>} EventTrigger */
/** @typedef {import('web-ext-event').Listener<EventArgsT>} Listener */
/** @typedef {import('web-ext-event').ListenerOptions} ListenerOptions */

let Content = /**@type{any}*/(null); if (typeof (/**@type{any}*/(globalThis).browser || /**@type{any}*/(globalThis).chrome).extension.getBackgroundPage !== 'function')
{ try { Content = /**@type{any}*/(define(/**@type{any}*/(null))).require('../loader/content'); } catch (_) { } }

let currentRoot = /**@type{OptionsRoot}*/(/**@type{any}*/(null)); // a OptionsRoot during its construction

/** @typedef {{
	root: OptionsRoot;
	values: Readonly<any[]>;
	isSet: boolean;
	onChange?: Event;
	fireChange?: EventTrigger;
	onAnyChange?: Event;
	fireAnyChange?: EventTrigger;
}} OptionP */

/** @typedef {{
	type?: 'string'|'number'|'boolean';
	readOnly?: boolean;
	from?: number|string;
	to?: number|string;
	match?: { exp?: string|RegExp, source?: string, flags?: string, message?: string, };
	isRegExp?: boolean;
	unique?: '.'|string|string[];
	custom?: string | ((value: any, values: any[], option: Option) => string);
}} RestrictModel */

/** @typedef {{
	type?: 'string'|'number'|'boolean'|'integer'|'boolInt'|'control'|'select'|'menulist'|'code'|'command'|'keybordKey'|'random'|'color'|'label';
	prefix?: string; suffix?: string;
	label?: string; id?: string;
	off?: any; on?: any;
	options?: { value: any, label: string, }[];
	default?: any;
}} InputModel */

/** @typedef {{
	name?: string;
	title?: string;
	description?: string;
	expanded?: boolean;
	default?: any;
	hidden?: boolean;
	maxLength?: number;
	minLength?: number;
	child?: ModelNode;
	input?: InputModel|InputModel[];
	restrict?: 'inherit'|RestrictModel|RestrictModel[];
	children?: Record<string, ModelNode>|'dynamic';
	extra?: Record<string, any>,
}} ModelNode */

const Self = /**@type{WeakMap<Option, OptionP>}*/(new WeakMap);
function get(/**@type{Option}*/key) { return /**@type{OptionP}*/(Self.get(key)); }

const OptionEvents = setEventGetters([ 'change', 'anyChange', ], /**@type{{ get (): OptionP, }}*/(/**@type{any}*/(Self)));

class Option extends OptionEvents {
	constructor(/**@type{DeepReadonly<ModelNode>}*/model, /**@type{Option|null}*/parent, name = model.name || '') { super();
		this.model = /**@type{ModelNode}*/(model); this.parent = parent; this.name = name;
		this.path = (parent ? parent.path +'.' : '') + this.name;

		if (!Object.hasOwnProperty.call(model, 'default')) {
			this.defaults = Object.freeze([ ]);
		} else if (Array.isArray(model.default)) {
			this.defaults = /**@type{any[]}*/(model.default);
		} else {
			this.defaults = Object.freeze([ model.default, ]);
		} this.default = this.defaults[0];

		this.values = new ValueList(this);
		const explicit = currentRoot.storage.get(this.values.key);

		/**@type{OptionP}*/const self = {
			root: currentRoot, values: explicit || this.defaults, isSet: !!explicit,
		}; Self.set(this, self);

		/**@type{Readonly<Option[] & Record<string, Option>>}*/let children;
		if (typeof model.child === 'object') {
			this.restrict = new Restriction(this, { type: 'string', match: { exp: (/^[0-9a-f]{12}$/), }, unique: '.', });
			children = ChildOptions(model.child, this, self);
		} else {
			const { restrict, } = model; this.restrict = restrict === 'inherit' ? parent?.restrict : restrict ? new Restriction(this, restrict) : null;
			children = model.children === 'dynamic' ? [ ] : /**@type{any}*/(new OptionList(model.children || [ ], this));
		} this.children = children;

		currentRoot.options.set(this.path, this);
		return Object.freeze(this);
	}

	get value() { return this.values.get(0); }
	set value(value) { this.values.set(0, value); }
	reset() { return this.values.reset(); }
	resetAll() { this.reset(); this.children.forEach(_=>_.resetAll()); }

	whenTrue(/**@type{Listener}*/listener, /**@type{ListenerOptions}*/arg) {
		return whenToggleTo(this, true, listener, arg);
	}
	whenFalse(/**@type{Listener}*/listener, /**@type{ListenerOptions}*/arg) {
		return whenToggleTo(this, false, listener, arg);
	}
	when(/**@type{{ true: Listener, false: Listener, }}*/true_false, /**@type{ListenerOptions}*/arg) {
		true_false && true_false.true  && whenToggleTo(this, true,  true_false.true,  arg);
		true_false && true_false.false && whenToggleTo(this, false, true_false.false, arg);
	}
	whenChange(/**@type{Listener}*/listener, /**@type{ListenerOptions}*/arg) {
		const values = get(this).values, added = this.onChange(listener, arg);
		added && listener(values, [ ], this);
		return added;
	}
} Object.freeze(Option.prototype);

///** @typedef {BaseOption & import('web-ext-event').WithEvents<"change" | "anyChange", OptionP>} Option */

function whenToggleTo(/**@type{Option}*/option, /**@type{boolean}*/should, /**@type{Listener}*/listener, /**@type{ListenerOptions}*/arg) {
	const wrapped = (/**@type{any[]}*/now, /**@type{any[]}*/old) => {
		const is = !!now.find(x=>x), was = !!old.find(x=>x);
		is !== was && is === should && listener(now, old, option);
	};
	option.onChange(wrapped, arg);
	const values = get(option).values;
	!!values.find(x=>x) === should && listener(values, [ ], option);
	return wrapped;
}

class OptionList extends Array {
	constructor(/**@type{DeepReadonly<ModelNode>[] | Record<String, DeepReadonly<ModelNode>>}*/items, /**@type{Option}*/parent) {
		super();
		Object.defineProperty(this, 'parent', { value: parent, });
		if (Array.isArray(items)) {
			items.forEach((item, index) => (this[item.name] = (this[index] = new Option(item, parent))));
		} else {
			Object.keys(items).forEach((key, index) => items[key] && (this[key] = (this[index] = new Option(items[key], parent, key))));
		}
		return /**@type{this}*/(Object.freeze(this));
	}
	static get [Symbol.species]() { return Array; }
} Object.freeze(OptionList.prototype);

function ChildOptions(/**@type{DeepReadonly<ModelNode>}*/model, /**@type{Option}*/parent, /**@type{OptionP}*/self) {
	const cache = /**@type{Record<string, Option>}*/({ });
	parent.onChange((/**@type{string[]}*/ids) => Object.keys(cache).forEach(id => { if (!ids.includes(id)) {
		toLeafs(cache[id], option => {
			const self = get(option);
			self.fireChange && self.fireChange(null, { last: true, });
			self.fireAnyChange && self.fireAnyChange(null, { last: true, });
		});
		delete cache[id];
	} }));

	return /**@type{Readonly<Option[] & Record<string, Option>>}*/(/**@type{any}*/(new Proxy(target || (target = new Uint8Array(1024)), {
		get(_, /**@type{string}*/key) {
			if (key === 'length') { return self.values.length; }
			if ((/^\d+$/).test(key)) { key = self.values[key]; }
			if (!self.values.includes(key)) { return Array.prototype[key]; }
			return cache[key] || (cache[key] = inContext(self.root, () => new Option(model, parent, key)));
		},
		ownKeys() { return Reflect.ownKeys(self.values).concat(
			'length', self.values.map((_, i) => i +'')
		); },
		getOwnPropertyDescriptor(_, key) {
			const value = this.get(_, key);
			return value === undefined ? value : { enumerable: true, value, };
		},
		getPrototypeOf() { return Array.prototype; },
	})));
} let target = /**@type{Uint8Array|null}*/(null);

class ValueList {
	constructor(/**@type{Option}*/parent) {
		this.parent = parent;
		this.key = currentRoot.prefix + this.parent.path;
		const { model, } = parent;
		this.max = Object.hasOwnProperty.call(model, 'maxLength') ? +model.maxLength : 1;
		this.min = Object.hasOwnProperty.call(model, 'minLength') ? +model.minLength : +!Object.hasOwnProperty.call(model, 'maxLength');
		return Object.freeze(this);
	}
	get current() { return get(this.parent).values; }
	get is() { return !!get(this.parent).values.find(x => x); }
	get isSet() { return get(this.parent).isSet; }
	get(index = 0) {
		return get(this.parent).values[index];
	}
	set(/**@type{number}*/index, /**@type{any}*/value) {
		const values = get(this.parent).values.slice();
		values[index] = value;
		this.parent.restrict && this.parent.restrict.validate(value, values, this.parent);
		return voidPromise(get(this.parent).root.storage.set(this.key, values));
	}
	replace(/**@type{any[]}*/values) {
		if (values.length < this.min || values.length > this.max) {
			throw new Error('the number of values for the option "'+ this.key +'" must be between '+ this.min +' and '+ this.max);
		}
		this.parent.restrict && this.parent.restrict.validateAll(values, this.parent);
		return voidPromise(get(this.parent).root.storage.set(this.key, values));
	}
	splice(/**@type{number}*/index, /**@type{number=}*/remove, /**@type{any[]}*/...insert) {
		const values = get(this.parent).values.slice();
		values.splice.apply(values, arguments);
		if (values.length < this.min || values.length > this.max) {
			throw new Error('the number of values for the option "'+ this.key +'" must be between '+ this.min +' and '+ this.max);
		}
		this.parent.restrict && this.parent.restrict.validateAll(insert, this.parent, index);
		return voidPromise(get(this.parent).root.storage.set(this.key, values));
	}
	reset() {
		return voidPromise(get(this.parent).root.storage.delete(this.key));
	}
} Object.freeze(ValueList.prototype);

class RestrictionBase {
	constructor() { const checks = /**@type{Readonly<({ (value: any, values: any[], option: Option): string|false|null|undefined|void, })[]>}*/([ ]); this.checks = checks; }
	validate(/**@type{any}*/value, /**@type{any[]}*/values, /**@type{Option}*/option) {
		const message = this.checks.map(check => check(value, values, option)).find(x => x);
		if (message) { throw new Error(message); }
	}
	validateAll(/**@type{any[]}*/values, /**@type{Option}*/option, offset = 0) {
		values.forEach((value, index) => { try {
			this.validate(value, values, option);
		} catch (error) {
			try { error.index = index + offset; } catch (e) { }
			throw error;
		} });
	}
} Object.freeze(RestrictionBase.prototype);

class Restriction extends RestrictionBase {
	constructor(/**@type{Option}*/parent, /**@type{DeepReadonly<RestrictModel|RestrictModel[]>}*/_restrict) {
		if (Array.isArray(_restrict)) { return new TupelRestriction(parent, _restrict); } const restrict = /**@type{DeepReadonly<RestrictModel>}*/(_restrict);
		super(); if (arguments.length === 0) { return this; }
		this._parent = parent;
		const from = restrict.from;
		const to = restrict.to;
		const match = restrict.match && Object.freeze({
			exp: restrict.match.exp ? new RegExp(/**@type{any}*/(restrict.match.exp)) : new RegExp(/**@type{string}*/(restrict.match.source), restrict.match.flags),
			message: restrict.match.message || 'This value must match '+ (restrict.match.exp || new RegExp(/**@type{string}*/(restrict.match.source), restrict.match.flags)),
		});
		const readOnly = restrict.readOnly;
		const type = restrict.type;
		const isRegExp = restrict.isRegExp;
		const unique = Object.freeze(restrict.unique);
		const checks = (super.checks || [ ]).slice();

		readOnly && checks.push(() => 'This value is read only');
		type && checks.push(value => typeof value !== type && ('This value must be of type "'+ type +'" but is "'+ (typeof value) +'"'));
		Object.hasOwnProperty.call(restrict, 'from') && checks.push(value => value < from && ('This value must be at least '+ from));
		Object.hasOwnProperty.call(restrict, 'to') && checks.push(value => value > to && ('This value can be at most '+ to));
		match && checks.push(value => !match.exp.test(value) && match.message);
		isRegExp && checks.push(value => void RegExp(value));
		Object.hasOwnProperty.call(restrict, 'unique') && (() => { let _unique;
			checks.push((value, values, option) => (_unique || (_unique = getUniqueSet(/**@type{any}*/(unique), parent))).map(other => {
				if (other === option) {
					return values.filter(v => v === value).length > 1 && 'This value must be unique within this option';
				}
				return other && other.values.current.indexOf(value) !== -1 && 'This value must be unique, but it is already used in "'+ other.title +'"';
			}).find(x => x));
		})();
		if (typeof restrict.custom === 'string') { checks.push(currentRoot.checks[restrict.custom]); }
		else if (typeof restrict.custom === 'function') { checks.push(restrict.custom); }
		this.checks = Object.freeze(checks);
		return Object.freeze(this);
	}
} Object.freeze(Restriction.prototype);

class TupelRestriction extends Restriction {
	constructor(/**@type{Option}*/parent, /**@type{RestrictModel[]}*/restricts) {
		super();
		const children = this.children = Object.freeze(restricts.map(_ => new Restriction(parent, _)));
		this.checks = Object.freeze([
			(/**@type{any[]}*/tuple) => tuple.length > children.length && `Tuple contains to many entries`,
			(/**@type{any[]}*/tuple) => {
				for (let i = 0; i < children.length; ++i) {
					try { children[i].validate(tuple[i], null, null); }
					catch (error) { return error.message; }
				} return null;
			},
		]);
		return Object.freeze(this);
	}
} Object.freeze(TupelRestriction);

function getUniqueSet(/**@type{string | readonly string[]}*/unique, /**@type{Option}*/parent) {
	const paths = (typeof unique === 'string' ? [ unique, ] : unique || [ ]).map(path => path.split(/[/\\]/));
	const result = /**@type{Set<Option>}*/(new Set);
	paths.forEach(path => walk(parent, path));
	return Object.freeze(Array.from(result));

	function walk(/**@type{Option}*/option, /**@type{string[]}*/path) {
		if (!path.length) { result.add(option); return; }
		const segment = /**@type{string}*/(path.shift());
		switch (segment) {
			case '.': {
				walk(option, path);
			} break;
			case '..': {
				walk(option.parent, path);
			} break;
			case '*': {
				option.children.forEach(child => walk(child, path));
			} break;
			default: {
				walk(option.children[segment], path);
			} break;
		}
	}
}

function toLeafs(/**@type{Option}*/option, /**@type{(option:Option) => void}*/action) {
	action(option);
	option.children.forEach(option => toLeafs(option, action));
}

function toRoot(/**@type{Option}*/option, /**@type{(option:Option) => void}*/action) {
	action(option);
	option.parent && toRoot(option.parent, action);
}

/**@template ReturnT */
function inContext(/**@type{OptionsRoot}*/root, /**@type{() => ReturnT}*/action) {
	{ currentRoot = root; } try {
		return action();
	} finally { currentRoot = /**@type{any}*/(null); }
}


// Uses only one listener per `storage` and routes updates based on prefix.
// Registers each by `.prefix` in a sorted list.
// On updates, finds the location of the key in the list.
// Only a sequence of predecessors of that position can match by prefix.
class ChangeListener {
	constructor(event) {
		if (changeListeners.has(event)) { return changeListeners.get(event); }
		(this.event = event).addListener(this.onChanged = this.onChanged.bind(this));
		this.prefixes = [ ]; this.listeners = [ ]; changeListeners.set(event, this);
	}
	destroy() { this.event.removeListener(this.onChanged); changeListeners.delete(this); }

	onChanged(key, value) {
		let index = ChangeListener.findIndex(this.prefixes, key);
		while (index) { index -= 1;
			if (key.startsWith(this.prefixes[index])) { break; } // skip "siblings" with smaller suffix
		} index += 1;
		while (index) { index -= 1;
			if (!key.startsWith(this.prefixes[index])) { return; }
			try { this.listeners[index].call(null, key, value); } catch (error) { console.error(error); }
		}
	}

	register(prefix, listener) {
		const index = ChangeListener.findIndex(this.prefixes, prefix);
		this.prefixes.splice(index, 0, prefix);
		this.listeners.splice(index, 0, listener);
	}
	unregister(listener) {
		const index = this.listeners.indexOf(listener);
		this.prefixes.splice(index, 1);
		this.listeners.splice(index, 1);
		!this.listeners.length && this.destroy();
	}

	static findIndex(A, T) { // returns the number of elements <= T
		// see: https://en.wikipedia.org/wiki/Binary_search_algorithm#Alternative_procedure
		if (!A.length) { return 0; }
		let L = 0, R = A.length - 1, m; do {
			m = (((L + R) / 2) + .5) |0;
			if (A[m] > T) { R = m - 1; }
			else { L = m; }
		} while (L < R);
		m = A[m] === T ? m : L; return T < A[m] ? m : m + 1;
	}
} const changeListeners = new WeakMap;

export default class OptionsRoot {
	constructor(/**@type{{ model: Record<String, ModelNode>, storage: import('../browser/storage.esm.js').CachedStorageArea, prefix: string, checks?: Record<string, (value: any, values: any[], option: Option) => string>, }}*/{ model, storage, prefix, checks, }) {
		this.model = deepFreeze(model); this.storage = storage; this.prefix = prefix; this.checks = checks;
		this.options = /**@type{Map<String, Option>}*/(new Map);
		this._shadow = inContext(this, () => new Option(Object.freeze({ children: this.model, }), null));
		this.children = this._shadow.children;

		this.destroy = this.destroy.bind(this);
		this.onChanged = this.onChanged.bind(this);
		storage.onChanged && new ChangeListener(storage.onChanged).register(prefix, this.onChanged);
		Content && Content.onUnload.addListener(this.destroy);
	}

	onChanged(/**@type{string}*/key, /**@type{any[]}*/values) {
		if (!key.startsWith(this.prefix) || this.destroyed) { return; }
		const option = this.options.get(key.slice(this.prefix.length)); if (!option) { return; }
		const self = get(option); if (!self) { return; }
		const old = self.values, now = values || option.defaults;
		self.values = now; self.isSet = !!values;
		const args = [ now, old, option, ];
		self.fireChange && self.fireChange(/**@type{EventArgsT}*/(args));
		toRoot(option, other => {
			const that = get(other);
			that.fireAnyChange && that.fireAnyChange(/**@type{EventArgsT}*/(args));
		});
	}

	resetAll() { return this._shadow.resetAll(); }
	onAnyChange(/**@type{Listener}*/listener, /**@type{ListenerOptions}*/arg) { return this._shadow.onAnyChange(listener, arg); }

	destroy() {
		this.destroyed = true;
		toLeafs(this._shadow, option => {
			const self = get(option);
			self.fireChange && self.fireChange(null, { last: true, });
			self.fireAnyChange && self.fireAnyChange(null, { last: true, });
		});
		this.storage.onChanged && new ChangeListener(this.storage.onChanged).unregister(this.onChanged);
		Content && Content.onUnload.removeListener(this.destroy);
	}

	static ObjectMap(data = /**@type{Record<String, any>}*/({ })) {
		const storage = {
			data, get(/**@type{string}*/key) { return data[key]; }, delete(/**@type{string}*/key) { return delete data[key]; },
			set(/**@type{string}*/key, /**@type{any}*/value) { onChanged([ key, value, data[key], ]); data[key] = value; },
			onChanged: /**@type{import('../browser/storage.esm.js').CachedStorageArea['onChanged']}*/(/**@type{any}*/(null)),
		}; const onChanged = setEvent(storage, 'onChanged', { async: true, });
		return storage;
	}
}

/** @template ObjectT */
function deepFreeze(/**@type{ObjectT}*/object) {
	const done = new WeakSet; (function doIt(object) {
		if (typeof object !== 'object' || object === null || done.has(/**@type{object}*/(object))) { return; }
		Object.freeze(object); done.add(/**@type{object}*/(object));
		Object.values(object).forEach(doIt);
	})(object); return /**@type{DeepReadonly<ObjectT>}*/(object);
}

function voidPromise(/**@type{Promise<any>}*/promise) {
	if (typeof promise.then !== 'function') { return undefined; }
	return promise.then(() => undefined); // eslint-disable-line
}
