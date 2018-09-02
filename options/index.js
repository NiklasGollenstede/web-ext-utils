(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../utils/event': { setEvent, setEventGetter, },
	require,
}) => {
let Content = null; if ((global.browser || global.chrome).extension.getBackgroundPage !== 'function')
{ try { Content = require('../loader/content'); } catch (_) { } }

let currentRoot = null; // a OptionsRoot during its construction

const Self = new WeakMap/*<Option, { root, values, isSet, on*, ... }>*/;

class Option {
	constructor(model, parent, name = model.name || '') {
		this.model = model; this.parent = parent; this.name = name;
		this.path = (parent ? parent.path +'.' : '') + this.name;

		if (!model.hasOwnProperty('default')) {
			this.defaults = Object.freeze([ ]);
		} else if (Array.isArray(model.default)) {
			this.defaults = model.default;
		} else {
			this.defaults = Object.freeze([ model.default, ]);
		} this.default = this.defaults[0];

		this.values = new ValueList(this);
		const explicit = currentRoot.storage.get(this.values.key);

		const self = {
			root: currentRoot, values: explicit || this.defaults, isSet: !!explicit,
			onChange: null, fireChange: null,
			onAnyChange: null, fireAnyChange: null,
		}; Self.set(this, self);

		if (typeof model.child === 'object') {
			this.restrict = new Restriction(this, { type: 'string', match: (/^[0-9a-f]{12}$/), unique: '.', });
			this.children = new ChildOptions(model.child, this, self);
		} else {
			this.restrict = model.restrict === 'inherit' ? parent.restrict : model.restrict ? new Restriction(this, model.restrict) : null;
			this.children = model.children === 'dynamic' ? [ ] : new OptionList(model.children || [ ], this);
		}

		currentRoot.options.set(this.path, this);
		return Object.freeze(this);
	}

	get value() { return this.values.get(0); }
	set value(value) { return this.values.set(0, value); }
	reset() { return this.values.reset(); }
	resetAll() { this.reset(); this.children.forEach(_=>_.resetAll()); }

	whenTrue(listener, arg) {
		return whenToggleTo(this, true, listener, arg);
	}
	whenFalse(listener, arg) {
		return whenToggleTo(this, false, listener, arg);
	}
	when(true_false, arg) {
		true_false && true_false.true  && whenToggleTo(this, true,  true_false.true,  arg);
		true_false && true_false.false && whenToggleTo(this, false, true_false.false, arg);
	}
	whenChange(listener) {
		const values = Self.get(this).values, added = this.onChange(...arguments);
		added && listener(values, [ ], this);
		return added;
	}
}
setEventGetter(Option, 'change', Self);
setEventGetter(Option, 'anyChange', Self);
Object.freeze(Option.prototype);

function whenToggleTo(option, should, listener, arg) {
	const wrapped = (now, old) => {
		const is = !!now.find(x=>x), was = !!old.find(x=>x);
		is !== was && is === should && listener(now, old, option);
	};
	option.onChange(wrapped, arg);
	const values = Self.get(option).values;
	!!values.find(x=>x) === should && listener(values, [ ], option);
	return wrapped;
}

class OptionList extends Array {
	constructor(items, parent) {
		super();
		Object.defineProperty(this, 'parent', { value: parent, });
		if (Array.isArray(items)) {
			items.forEach((item, index) => (this[item.name] = (this[index] = new Option(item, parent))));
		} else {
			Object.keys(items).forEach((key, index) => items[key] && (this[key] = (this[index] = new Option(items[key], parent, key))));
		}
		return Object.freeze(this);
	}
	static get [Symbol.species]() { return Array; }
} Object.freeze(OptionList.prototype);

function ChildOptions(model, parent, self) {
	const cache = { };
	parent.onChange(ids => Object.keys(cache).forEach(id => { if (!ids.includes(id)) {
		toLeafs(cache[id], option => {
			const self = Self.get(option);
			self.onChange && self.onChange(null, { last: true, });
			self.onAnyChange && self.onAnyChange(null, { last: true, });
		});
		delete cache[id];
	} }));

	return new Proxy(target || (target = new Uint8Array(1024)), {
		get(_, key) {
			if (key === 'length') { return self.values.length; }
			if ((/^\d+$/).test(key)) { key = self.values[key]; }
			if (!self.values.includes(key)) { return Array.prototype[key]; }
			return cache[key] || (cache[key] = inContext(self.root, () => new Option(model, parent, key)));
		},
		ownKeys() { return Reflect.ownKeys(self.values).concat(
			self.values.length, self.vslues.map((_, i) => i)
		); },
		getOwnPropertyDescriptor(_, key) {
			const value = this.get(_, key);
			return value === undefined ? value : { enumerable: true, value, };
		},
		getPrototypeOf() { return Array.prorotype; },
	});
} let target;

class ValueList {
	constructor(parent) {
		this.parent = parent;
		this.key = currentRoot.prefix + this.parent.path;
		const { model, } = parent;
		this.max = model.hasOwnProperty('maxLength') ? +model.maxLength : 1;
		this.min = model.hasOwnProperty('minLength') ? +model.minLength : +!model.hasOwnProperty('maxLength');
		return Object.freeze(this);
	}
	get current() { return Self.get(this.parent).values; }
	get is() { return !!Self.get(this.parent).values.find(x => x); }
	get isSet() { return Self.get(this.parent).isSet; }
	get(index = 0) {
		return Self.get(this.parent).values[index];
	}
	set(index, value) {
		const values = Self.get(this.parent).values.slice();
		values[index] = value;
		this.parent.restrict && this.parent.restrict.validate(value, values, this.parent);
		return voidPromise(Self.get(this.parent).root.storage.set(this.key, values));
	}
	replace(values) {
		if (values.length < this.min || values.length > this.max) {
			throw new Error('the number of values for the option "'+ this.key +'" must be between '+ this.min +' and '+ this.max);
		}
		this.parent.restrict && this.parent.restrict.validateAll(values, this.parent);
		return voidPromise(Self.get(this.parent).root.storage.set(this.key, values));
	}
	splice(index, remove, ...insert) {
		const values = Self.get(this.parent).values.slice();
		values.splice.apply(values, arguments);
		if (values.length < this.min || values.length > this.max) {
			throw new Error('the number of values for the option "'+ this.key +'" must be between '+ this.min +' and '+ this.max);
		}
		this.parent.restrict && this.parent.restrict.validateAll(insert, this.parent, index);
		return voidPromise(Self.get(this.parent).root.storage.set(this.key, values));
	}
	reset() {
		return voidPromise(Self.get(this.parent).root.storage.delete(this.key));
	}
} Object.freeze(ValueList.prototype);

class RestrictionBase {
	validate(value, values, option) {
		const message = this.checks.map(check => check(value, values, option)).find(x => x);
		if (message) { throw new Error(message); }
	}
	validateAll(values, option, offset = 0) {
		values.forEach((value, index) => { try {
			this.validate(value, values, option);
		} catch (error) {
			try { error.index = index + offset; } catch (e) { }
			throw error;
		} });
	}
} Object.freeze(RestrictionBase.prototype);

class Restriction extends RestrictionBase {
	constructor(parent, restrict) {
		if (Array.isArray(restrict)) { return new TupelRestriction(parent, restrict); }
		super();
		this._parent = parent;
		const from = restrict.from;
		const to = restrict.to;
		const match = restrict.match && Object.freeze({
			exp: restrict.match.exp ? new RegExp(restrict.match.exp) : new RegExp(restrict.match.source, restrict.match.flags),
			message: restrict.match.message || 'This value must match '+ (restrict.match.exp || new RegExp(restrict.match.source, restrict.match.flags)),
		});
		const readOnly = restrict.readOnly;
		const type = restrict.type;
		const isRegExp = restrict.isRegExp;
		const unique = Object.freeze(restrict.unique);
		const checks = [ ];

		readOnly && checks.push(() => 'This value is read only');
		type && checks.push(value => typeof value !== type && ('This value must be of type "'+ type +'" but is "'+ (typeof value) +'"'));
		restrict.hasOwnProperty('from') && checks.push(value => value < from && ('This value must be at least '+ from));
		restrict.hasOwnProperty('to') && checks.push(value => value > to && ('This value can be at most '+ to));
		match && checks.push(value => !match.exp.test(value) && match.message);
		isRegExp && checks.push(value => void RegExp(value));
		restrict.hasOwnProperty('unique') && (() => { let _unique;
			checks.push((value, values, option) => (_unique || (_unique = getUniqueSet(unique, parent))).map(other => {
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

class TupelRestriction extends RestrictionBase {
	constructor(parent, restricts) {
		super();
		const children = this.children = Object.freeze(restricts.map(_ => new Restriction(parent, _)));
		this.checks = Object.freeze([
			tuple => tuple.length > children.length && `Tuple contains to many entries`,
			tuple => {
				for (let i = 0; i < children.length; ++i) {
					const error = children[i].validate(tuple[i], null, null);
					if (error) { return error; }
				} return null;
			},
		]);
		return Object.freeze(this);
	}
} Object.freeze(TupelRestriction);

function getUniqueSet(unique, parent) {
	const paths = (typeof unique === 'string' ? [ unique, ] : unique || [ ]).map(path => path.split(/[/\\]/));
	const result = new Set;
	paths.forEach(path => walk(parent, path));
	return Object.freeze(Array.from(result));

	function walk(option, path) {
		if (!path.length) { result.add(option); return; }
		const segment = path.shift();
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

function toLeafs(option, action) {
	action(option);
	option.children.forEach(option => toLeafs(option, action));
}

function toRoot(option, action) {
	action(option);
	option.parent && toRoot(option.parent, action);
}

function inContext(root, action) {
	try {
		currentRoot = root;
		return action();
	} finally {
		currentRoot = null;
	}
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

return class OptionsRoot {
	constructor({ model, storage, prefix, checks, }) {
		this.model = deepFreeze(model); this.storage = storage; this.prefix = prefix; this.checks = checks;
		this.options = new Map;
		this._shadow = inContext(this, () => new Option({ children: model, }, null));
		this.children = this._shadow.children;

		this.destroy = this.destroy.bind(this);
		this.onChanged = this.onChanged.bind(this);
		storage.onChanged && new ChangeListener(storage.onChanged).register(prefix, this.onChanged);
		Content && Content.onUnload.addListener(this.destroy);
	}

	onChanged(key, values) {
		if (!key.startsWith(this.prefix) || this.destroyed) { return; }
		const option = this.options.get(key.slice(this.prefix.length));
		const self = Self.get(option); if (!self) { return; }
		const old = self.values, now = values || option.defaults;
		self.values = now; self.isSet = !!values;
		const args = [ now, old, option, ];
		self.fireChange && self.fireChange(args);
		toRoot(option, other => {
			const that = Self.get(other);
			that.fireAnyChange && that.fireAnyChange(args);
		});
	}

	resetAll() { return this._shadow.resetAll(); }
	onAnyChange() { return this._shadow.onAnyChange(...arguments); }

	destroy() {
		this.destroyed = true;
		toLeafs(this._shadow, option => {
			const self = Self.get(option);
			self.onChange && self.onChange(null, { last: true, });
			self.onAnyChange && self.onAnyChange(null, { last: true, });
		});
		this.storage.onChanged && new ChangeListener(this.storage.onChanged).unregister(this.onChanged);
		Content && Content.onUnload.removeListener(this.destroy);
	}

	static ObjectMap(data = { }) {
		const storage = {
			data, get(key) { return data[key]; }, delete(key) { return delete data[key]; },
			set(key, value) { onChanged([ key, value, data[key], ]); data[key] = value; },
		}; const onChanged = setEvent(storage, 'onChenged', { async: true, }); return storage;
	}
};

function deepFreeze(object) {
	const done = new WeakSet; (function doIt(object) {
		if (typeof object !== 'object' || object === null || done.has(object)) { return; }
		Object.freeze(object); done.add(object);
		Object.values(object).forEach(doIt);
	})(object); return object;
}

function voidPromise(promise) {
	if (typeof promise.then !== 'function') { return undefined; }
	return promise.then(() => undefined); // eslint-disable-line
}

}); })(this);
