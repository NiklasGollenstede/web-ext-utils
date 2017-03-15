(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../browser/': { Storage, },
	require,
}) => {

let context = null; // a OptionsRoot during its construction

const Values = new WeakMap/*<Option, ValueList>*/;
const IsSet = new WeakMap/*<ValueList, bool>*/;
const OnTrue = new WeakMap/*<Option, Set<function>>*/;
const OnFalse = new WeakMap/*<Option, Set<function>>*/;
const OnChange = new WeakMap/*<Option, Set<function>>*/;
const OnAnyChange = new WeakMap/*<Option, Set<function>>*/;
const dummySet = new Set; // to delete from

const callbackMaps = [ OnTrue, OnFalse, OnChange, OnAnyChange, ];

const Contexts = new WeakMap;

class Option {
	constructor(model, parent, name = model.name || '') {
		this.model = model;
		this.parent = parent;
		this.name = name;
		this.path = (parent ? parent.path +'.' : '') + this.name;

		if (!model.hasOwnProperty('default')) {
			this.defaults = Object.freeze([ ]);
		} else if (Array.isArray(model.default)) {
			this.defaults = model.default;
		} else {
			this.defaults = Object.freeze([ model.default, ]);
		}
		this.default = this.defaults[0];

		this.restrict = model.restrict === 'inherit' ? parent.restrict : model.restrict ? new Restriction(this, model.restrict) : null;

		this.children = new OptionList(model.children || [ ], this);

		context.options.set(this.path, this);
		Contexts.set(this, context);
		return Object.freeze(this);
	}

	get value() { return Values.get(this).get(0); }
	set value(value) { return Values.get(this).set(0, value); }
	get values() { return Values.get(this); }
	set values(values) { return Values.get(this).replace(values); }
	reset() { return Values.get(this).reset(); }
	resetAll() {
		const ctx = Contexts.get(this), path = ctx.prefix + this.path;
		return ctx.storage.remove(ctx.keys.filter(_=>_.startsWith(path)));
	}

	whenTrue(listener, { owner, } = { }) {
		const values = this.values;
		const listeners = OnTrue.get(this) || new Set;
		OnTrue.set(this, listeners);
		owner && owner.addEventListener('unload', () => listeners.delete(listener));
		if (listeners.has(listener)) { return false; }
		listeners.add(listener);
		values.is && callAll([ listener, ], values.get(0), values, null, this.path);
		return true;
	}
	whenFalse(listener, { owner, } = { }) {
		const values = this.values;
		const listeners = OnFalse.get(this) || new Set;
		OnFalse.set(this, listeners);
		owner && owner.addEventListener('unload', () => listeners.delete(listener));
		if (listeners.has(listener)) { return false; }
		listeners.add(listener);
		!values.is && callAll([ listener, ], values.get(0), values, null, this.path);
		return true;
	}
	when(true_false, { owner, } = { }) {
		true_false && true_false.true  && this.whenTrue (true_false.true,  owner);
		true_false && true_false.false && this.whenFalse(true_false.false, owner);
	}
	whenChange(listener, { owner, } = { }) {
		const values = this.values;
		const listeners = OnChange.get(this) || new Set;
		OnChange.set(this, listeners);
		owner && owner.addEventListener('unload', () => listeners.delete(listener));
		if (listeners.has(listener)) { return false; }
		listeners.add(listener);
		callAll([ listener, ], values.get(0), values, null, this.path);
		return true;
	}
	onChange(listener, { owner, } = { }) {
		const listeners = OnChange.get(this) || new Set;
		OnChange.set(this, listeners);
		owner && owner.addEventListener('unload', () => listeners.delete(listener));
		return listeners.add(listener);
	}
	onAnyChange(listener, { owner, } = { }) {
		const listeners = OnAnyChange.get(this) || new Set;
		OnAnyChange.set(this, listeners);
		owner && owner.addEventListener('unload', () => listeners.delete(listener));
		return listeners.add(listener);
	}
	offAnyChange(listener) {
		const listeners = OnAnyChange.get(this);
		return listeners && listeners.delete(listener);
	}
	off(listener) {
		[ OnTrue, OnFalse, OnChange, OnAnyChange, ].forEach(_=>(_.get(this) || dummySet).delete(listener));
	}
} Object.freeze(Option.prototype);

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

class ValueList {
	constructor(parent, values) {
		this.parent = parent;

		this.key = context.prefix + this.parent.path;
		Values.set(this, Object.freeze(values));
		const { model, } = parent;
		this.max = model.hasOwnProperty('maxLength') ? +model.maxLength : 1;
		this.min = model.hasOwnProperty('minLength') ? +model.minLength : +!model.hasOwnProperty('maxLength');
		return Object.freeze(this);
	}
	get current() { return Values.get(this); }
	get is() { return !!Values.get(this).find(x => x); }
	get isSet() { return IsSet.get(this); }
	get(index) {
		return Values.get(this)[index];
	}
	set(index, value) {
		const values = Values.get(this).slice();
		values[index] = value;
		this.parent.restrict.validate(value, values, this.parent);
		return Contexts.get(this.parent).storage.set({ [this.key]: values, });
	}
	replace(values) {
		if (values.length < this.min || values.length > this.max) {
			throw new Error('the number of values for the option "'+ this.key +'" must be between '+ this.min +' and '+ this.max);
		}
		this.parent.restrict && this.parent.restrict.validateAll(values, this.parent);
		return Contexts.get(this.parent).storage.set({ [this.key]: values, });
	}
	splice(index, remove, ...insert) {
		const values = Values.get(this).slice();
		values.splice.apply(values, arguments);
		if (values.length < this.min || values.length > this.max) {
			throw new Error('the number of values for the option "'+ this.key +'" must be between '+ this.min +' and '+ this.max);
		}
		this.parent.restrict && this.parent.restrict.validateAll(insert, this.parent, index);
		return Contexts.get(this.parent).storage.set({ [this.key]: values, });
	}
	reset() {
		return Contexts.get(this.parent).storage.remove(this.key);
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
		restrict.hasOwnProperty('from') && checks.push(value => value < from && ('This value must be at least '+ from));
		restrict.hasOwnProperty('to') && checks.push(value => value > to && ('This value can be at most '+ to));
		match && checks.push(value => !match.exp.test(value) && match.message);
		type && checks.push(value => typeof value !== type && ('This value must be of type "'+ type +'" but is "'+ (typeof value) +'"'));
		isRegExp && checks.push(value => void RegExp(value));
		parent.type !== 'interval' && restrict.hasOwnProperty('unique') && (_unique => {
			checks.push((value, values, option) => (_unique || (_unique = getUniqueSet(unique, parent))).map(other => {
				if (other === option) {
					return values.filter(v => v === value).length > 1 && 'This value must be unique within this option';
				}
				return other && other.values.current.indexOf(value) !== -1 && 'This value must be unique, but it is already used in "'+ other.title +'"';
			}).find(x => x));
		})();
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
	const paths = (typeof unique === 'string' ? [ unique, ] : unique || [ ]).map(path => path.split(/[\/\\]/));
	const result = new Set;
	paths.forEach(path => walk(parent, path));
	return Object.freeze(Array.from(result));

	function walk(option, path) {
		if (!path.length) { return void result.add(option); }
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

function callAll(callbacks, value, values, old, path) {
	callbacks && callbacks.forEach(listener => { try {
		listener(value, values, old);
	} catch (error) { console.error('Options change listener for "'+ path +'" threw', error); } });
}

function crawlDown(option, callback) {
	callback(option);
	option.children.forEach(option => crawlDown(option, callback));
}

function climbUp(option, callback) {
	callback(option);
	option.parent && climbUp(option.parent, callback);
}

function inContext(ctx, callback) {
	try {
		context = ctx;
		return callback();
	} finally {
		context = null;
	}
}

return class OptionsRoot {
	constructor({ model, prefix, storage, onChanged, }) {
		this.model = deepFreeze(model);
		this.options = new Map;
		if (!storage && !onChanged) { try {
			require('../loader/content')
			.onUnload.addListener(() => this.destroy());
		} catch (_) { /* not in content */ } }
		this.prefix = prefix = prefix == null ? 'options' : prefix;
		this.storage = storage = storage || Storage.sync;
		this._onChanged = onChanged = onChanged || (storage === Storage.sync || storage === Storage.local ? Storage.onChanged : null);
		inContext(this, () => (this._shadow = new Option({ children: model, }, null)));
		this.children = this._shadow.children;
		this.onChanged = this.onChanged.bind(this);
		this.keys = Array.from(this.options.keys()).map(path => prefix + path);

		return storage.get(this.keys)
		.then(data => inContext(this, () => {
			if (Array.isArray(data) && data.length === 1) { data = data[0]; } // some weird Firefox bug
			this.options.forEach(option => {
				const set = data.hasOwnProperty(prefix + option.path);
				const values = new ValueList(option, set ? data[prefix + option.path] : option.defaults);
				Values.set(option, values);
				IsSet.set(values, set);
			});
			onChanged && onChanged.addListener(this.onChanged);
			return this;
		}));
	}

	onChanged(changes) { Object.keys(changes).forEach(key => {
		if (!key.startsWith(this.prefix) || this.destroyed) { return; }
		const path = key.slice(this.prefix.length);
		const option = this.options.get(path);
		if (!option) { return; }
		const values = changes[key].newValue || option.defaults;
		const list = option.values;
		const old = Values.get(list);
		Values.set(list, values);
		IsSet.set(list, !!changes[key].newValue);

		const is = !!values.find(x => x);
		const was = !!old.find(x => x);

		callAll(OnChange.get(option), values[0], list, old, path);
		climbUp(option, option => callAll(OnAnyChange.get(option), values[0], list, old, path));
		is && !was && callAll(OnTrue.get(option), values[0], list, old, path);
		!is && was && callAll(OnFalse.get(option), values[0], list, old, path);
	}); }

	resetAll() {
		return this.storage.remove(this.keys);
	}

	onAnyChange() {
		return this._shadow.onAnyChange(...arguments);
	}

	destroy() {
		this.destroyed = true;
		crawlDown(this._shadow, option => callbackMaps.forEach(map => map.delete(option)));
		this._onChanged && this._onChanged.removeListener(this.onChanged);
	}
};

function deepFreeze(object) {
	const done = new WeakSet;
	(function doIt(object) {
		if (typeof object !== 'object' || object === null || done.has(object)) { return; }
		done.add(object);
		Object.freeze(object);
		Object.keys(object).forEach(key => doIt(object[key]));
	})(object);
	return object;
}

}); })(this);
