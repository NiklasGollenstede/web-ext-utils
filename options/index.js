(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../browser/': { Storage, inContent, },
	'../utils/event': { setEventGetter, },
	require,
}) => {

let currentRoot = null; // a OptionsRoot during its construction

const Self = new WeakMap/*<Option, { root, values, isSet, on*, ... }>*/;

class Option {
	constructor(model, parent, name = model.name || '') {
		const self = {
			root: currentRoot, // OptionsRoot
			values: null, // frozen Array, this.values
			isSet: false,
			onChange: null, fireChange: null,
			onAnyChange: null, fireAnyChange: null,
		}; Self.set(this, self);
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

		this.children = model.children === 'dynamic' ? [ ] : new OptionList(model.children || [ ], this);

		currentRoot.options.set(this.path, this);
		this.values = null; // ValueList, set by root

		// will be frozen by the root
	}

	get value() { return this.values.get(0); }
	set value(value) { return this.values.set(0, value); }
	reset() { return this.values.reset(); }
	async resetAll() {
		const root = Self.get(this).root, path = root.prefix + this.path;
		return void (await root.storage.remove(root.keys.filter(_=>_.startsWith(path))));
	}

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

class ValueList {
	constructor(parent, values) {
		this.parent = parent;

		this.key = currentRoot.prefix + this.parent.path;
		Self.get(parent).values = Object.freeze(values);
		const { model, } = parent;
		this.max = model.hasOwnProperty('maxLength') ? +model.maxLength : 1;
		this.min = model.hasOwnProperty('minLength') ? +model.minLength : +!model.hasOwnProperty('maxLength');
		return Object.freeze(this);
	}
	get current() { return Self.get(this.parent).values; }
	get is() { return !!Self.get(this.parent).values.find(x => x); }
	get isSet() { return Self.get(this.parent).isSet; }
	get(index) {
		return Self.get(this.parent).values[index];
	}
	async set(index, value) {
		const values = Self.get(this.parent).values.slice();
		values[index] = value;
		this.parent.restrict && this.parent.restrict.validate(value, values, this.parent);
		return void (await Self.get(this.parent).root.storage.set({ [this.key]: values, }));
	}
	async replace(values) {
		if (values.length < this.min || values.length > this.max) {
			throw new Error('the number of values for the option "'+ this.key +'" must be between '+ this.min +' and '+ this.max);
		}
		this.parent.restrict && this.parent.restrict.validateAll(values, this.parent);
		return void (await Self.get(this.parent).root.storage.set({ [this.key]: values, }));
	}
	async splice(index, remove, ...insert) {
		const values = Self.get(this.parent).values.slice();
		values.splice.apply(values, arguments);
		if (values.length < this.min || values.length > this.max) {
			throw new Error('the number of values for the option "'+ this.key +'" must be between '+ this.min +' and '+ this.max);
		}
		this.parent.restrict && this.parent.restrict.validateAll(insert, this.parent, index);
		return void (await Self.get(this.parent).root.storage.set({ [this.key]: values, }));
	}
	async reset() {
		return void (await Self.get(this.parent).root.storage.remove(this.key));
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

function toLeafs(option, callback) {
	callback(option);
	option.children.forEach(option => toLeafs(option, callback));
}

function toRoot(option, callback) {
	callback(option);
	option.parent && toRoot(option.parent, callback);
}

function inContext(root, callback) {
	try {
		currentRoot = root;
		return callback();
	} finally {
		currentRoot = null;
	}
}

return class OptionsRoot {
	/*async*/ constructor({
		model,
		storage = Storage.sync,
		prefix = storage === Storage.sync || storage === Storage.local ? 'options' : '',
		onChanged = storage === Storage.sync || storage === Storage.local ? Storage.onChanged : null,
	}) { return (async () => {
		if (inContent) { try {
			require('../loader/content')
			.onUnload.addListener(() => this.destroy());
		} catch (_) { } }
		this.model = deepFreeze(model); this.storage = storage; this.prefix = prefix; this._onChanged = onChanged;
		this.options = new Map;
		this.onChanged = this.onChanged.bind(this);
		onChanged && onChanged.addListener(this.onChanged);
		this._shadow = inContext(this, () => new Option({ children: model, }, null));
		this.children = this._shadow.children;
		this.keys = Array.from(this.options.keys()).map(path => prefix + path);

		let data = (await storage.get(this.keys));
		if (Array.isArray(data) && data.length === 1) { data = data[0]; } // some weird Firefox bug
		inContext(this, () => this.options.forEach(option => {
			const isSet = data.hasOwnProperty(prefix + option.path);
			option.values = new ValueList(option, isSet ? data[prefix + option.path] : option.defaults);
			Self.get(option).isSet = isSet;
			Object.freeze(option);
		}));
		return this;
	})(); }

	onChanged(changes) { Object.keys(changes).forEach(key => {
		if (!key.startsWith(this.prefix) || this.destroyed) { return; }
		const option = this.options.get(key.slice(this.prefix.length));
		const self = Self.get(option); if (!self) { return; }
		const old = self.values;
		const now = Object.freeze(changes[key].newValue || option.defaults);
		self.values = now; self.isSet = !!changes[key].newValue;
		const args = [ now, old, option, ];
		self.fireChange && self.fireChange(args);
		toRoot(option, other => {
			const that = Self.get(other);
			that.fireAnyChange && that.fireAnyChange(args);
		});
	}); }

	async resetAll() {
		return void (await this.storage.remove(this.keys));
	}

	onAnyChange() {
		return this._shadow.onAnyChange(...arguments);
	}

	destroy() {
		this.destroyed = true;
		toLeafs(this._shadow, option => {
			const self = Self.get(option);
			self.onChange && self.onChange(null, { last: true, });
			self.onAnyChange && self.onAnyChange(null, { last: true, });
		});
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
