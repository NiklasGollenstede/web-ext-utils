'use strict'; define('web-ext-utils/options', [
], function(
) {

let context = null; // a OptionsRoot during its constrution

const Defaults = new WeakMap;
const Values = new WeakMap;
const OnTrue = new WeakMap;
const OnFalse = new WeakMap;
const OnChange = new WeakMap;
const OnAnyChange = new WeakMap;

const callbackMaps = [ OnTrue, OnFalse, OnChange, OnAnyChange, ];

const Storage = new WeakMap;
const _uniqueCache = new WeakMap;

class Option {
	constructor(_default, parent) {
		Defaults.set(this, _default);
		this.parent = parent;
		this.path = (parent ? parent.path +'.' : '') + (_default.name || '');
		_default.name && (this.name = _default.name +'');
		_default.type && (this.type = _default.type +'');
		_default.title && (this.title = _default.title +'');
		_default.description && (this.description = _default.description +'');
		_default.unit && (this.unit = _default.unit +'');
		_default.addDefault && (this.addDefault = _default.addDefault);
		_default.options && (this.options = Object.freeze(
			Array.prototype.filter.call(_default.options, option => option && option.label)
			.map(({ label, value, }) => Object.freeze({ label, value, }))
		));
		if (!_default.hasOwnProperty('default')) {
			this.defaults = Object.freeze([ ]);
		} else if (Array.isArray(_default.default)) {
			this.defaults = Object.freeze(_default.default.map(Object.freeze));
			this.default = _default.default[0];
		} else {
			this.default = Object.freeze(_default.default);
			this.defaults = Object.freeze([ this.default ]);
		}

		_default.restrict && (this.restrict = _default.restrict === 'inherit' ? parent.restrict : new Restriction(this, _default.restrict));

		this.children = new OptionList((_default.children || [ ]).map(child => new Option(child, this)), this);

		context.options.set(this.path, this);
		return Object.freeze(this);
	}

	get value() { return Values.get(this).get(0); }
	set value(value) { return Values.get(this).set(0, value); }
	get values() { return Values.get(this); }
	set values(values) { return Values.get(this).replace(values); }
	reset() { return Values.get(this).reset(); }
	resetAll() {
		this.reset();
		this.children.forEach(child => child.resetAll());
	}

	whenTrue(listener) {
		const values = this.values;
		let listeners = OnTrue.get(this) || new Set;
		OnTrue.set(this, listeners);
		const added = listeners.add(listener);
		added && values.is && callAll([ listener, ], values.get(0), values, null, this.path);
		return added;
	}
	whenFalse(listener) {
		const values = this.values;
		let listeners = OnFalse.get(this) || new Set;
		OnFalse.set(this, listeners);
		const added = listeners.add(listener);
		added && !values.is && callAll([ listener, ], values.get(0), values, null, this.path);
		return added;
	}
	when(true_false) {
		true_false && true_false.true && this.whenTrue(true_false.true);
		true_false && true_false.false && this.whenFalse(true_false.false);
	}
	whenChange(listener) {
		const values = this.values;
		let listeners = OnChange.get(this) || new Set;
		OnChange.set(this, listeners);
		const added = listeners.add(listener);
		added && callAll([ listener, ], values.get(0), values, null, this.path);
		return added;
	}
	onChange(listener) {
		let listeners = OnChange.get(this) || new Set;
		OnChange.set(this, listeners);
		return listeners.add(listener);
	}
	onAnyChange(listener) {
		let listeners = OnAnyChange.get(this) || new Set;
		OnAnyChange.set(this, listeners);
		return listeners.add(listener);
	}
	offAnyChange(listener) {
		let listeners = OnAnyChange.get(this);
		return listeners && listeners.delete(listener);
	}

}

class OptionList extends Array {
	constructor(items, parent) {
		super();
		Object.defineProperty(this, 'parent', { value: parent, });
		items.forEach((item, index, array) => this[item.name] = this[index] = item);
		return Object.freeze(this);
	}
}

class ValueList {
	constructor(parent, values) {
		this.parent = parent;
		Storage.set(this, context.storage);

		this.key = context.prefix + this.parent.path;
		Values.set(this, Object.freeze(values));
		const _default = Defaults.get(parent);
		this.max = _default.hasOwnProperty('maxLength') ? +_default.maxLength : 1;
		this.min = _default.hasOwnProperty('minLength') ? +_default.minLength : +!_default.hasOwnProperty('maxLength');
		return Object.freeze(this);
	}
	get current() { return Values.get(this); }
	get is() { return !!Values.get(this).find(x => x); }
	get(index) {
		return Values.get(this)[index];
	}
	set(index, value) {
		const values = Values.get(this).slice();
		values[index] = value;
		this.parent.restrict.validate(value, values, this.parent);
		return Storage.get(this).set({ [this.key]: values, });
	}
	replace(values) {
		if (values.length < this.min || values.length > this.max) {
			throw new Error('the number of values for the option "'+ this.key +'" must be between '+ this.min +' and '+ this.max);
		}
		this.parent.restrict && this.parent.restrict.validateAll(values, this.parent);
		return Storage.get(this).set({ [this.key]: values, });
	}
	splice(index, remove, ...insert) {
		const values = Values.get(this).slice();
		values.splice.apply(values, arguments);
		if (values.length < this.min || values.length > this.max) {
			throw new Error('the number of values for the option "'+ this.key +'" must be between '+ this.min +' and '+ this.max);
		}
		this.parent.restrict && this.parent.restrict.validateAll(insert, this.parent, index);
		return Storage.get(this).set({ [this.key]: values, });
	}
	reset() {
		return Storage.get(this).remove(this.key);
	}
}

class Restriction {
	constructor(parent, restrict) {
		this._parent = parent;
		const from = this.from = restrict.from;
		const to = this.to = restrict.to;
		const match = this.match = restrict.match;
		const type = this.type = restrict.type;
		const isRegExp = this.isRegExp = restrict.isRegExp;
		const unique = this.unique = Object.freeze(restrict.unique);
		const checks = [ ];
		match && !match.exp && (match.exp = RegExp(match.source, match.flags));
		match && !match.message && (match.message = 'This value must match '+ match);
		Object.freeze(match);
		restrict.hasOwnProperty('from') && checks.push(value => value < from && ('This value must be at least '+ from));
		restrict.hasOwnProperty('to') && checks.push(value => value > to && ('This value can be at most '+ to));
		match && checks.push(value => !match.exp.test(value) && match.message);
		type && checks.push(value => typeof value !== type && ('This value must be of type "'+ type +'" but is "'+ (typeof value) +'"'));
		isRegExp && checks.push(value => void RegExp(value));
		parent.type !== 'interval' && restrict.hasOwnProperty('unique') && (() => {
			checks.push((value, values, option) => this._unique.map(other => {
				if (other === option) {
					return values.filter(v => v === value).length > 1 && 'This value must be unique winthin this option';
				}
				return other && other.values.current.indexOf(value) !== -1 && 'This value must be unique, but it is already used in "'+ other.title +'"';
			}).find(x => x));
		})();
		this.checks = Object.freeze(checks);
		return Object.freeze(this);
	}
	validate(value, values, option) {
		const message = this._parent.type === 'interval'
		? this.checks.map(check => typeof value === 'object' && (check(value.from) || check(value.to))).find(x => x)
		: this.checks.map(check => check(value, values, option)).find(x => x);
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
	get _unique() {
		let options = _uniqueCache.get(this);
		if (options) { return options; }
		const paths = (typeof this.unique === 'string' ? [ this.unique, ] : this.unique || [ ]).map(path => path.split(/[\/\\]/));
		const result = new Set;
		paths.forEach(path => walk(this._parent, path));
		options = Object.freeze(Array.from(result));
		_uniqueCache.set(this, options);
		return options;

		function walk(option, path) {
			if (!path.length) { return result.add(option); }
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
	constructor({ defaults, prefix, storage, addChangeListener, removeChangeListener, }) {
		const options = this.options = new Map;
		this.prefix = prefix; this.storage = storage;
		inContext(this, () => this._shadow = new Option({ children: defaults, }, null));
		this.children = this._shadow.children;
		this.onChange = this.onChange.bind(this);
		this._removeChangeListener = removeChangeListener;

		return storage.get(Array.from(options.keys()).map(path => prefix + path))
		.then(data => inContext(this, () => {
			const { hasOwnProperty, } = Object.prototype;
			options.forEach(option => Values.set(option, new ValueList(
				option,
				hasOwnProperty.call(data, prefix + option.path) ? data[prefix + option.path] : option.defaults
			)));
			addChangeListener && addChangeListener.call(this, this.onChange);

			return this;
		}));
	}

	onChange(key, values) {
		if (!key.startsWith(this.prefix) || this.destroyed) { return; }
		const path = key.slice(this.prefix.length);
		const option = this.options.get(path);
		!values && (values = option.defaults);
		const list = option.values;
		const old = Values.get(list);
		Values.set(list, values);

		const is = values.find(x => x);
		const was = old.find(x => x);

		callAll(OnChange.get(option), values[0], list, old, path);
		climbUp(option, option => callAll(OnAnyChange.get(option), values[0], list, old, path));
		is && !was && callAll(OnTrue.get(option), values[0], list, old, path);
		!is && was && callAll(OnFalse.get(option), values[0], list, old, path);
	}

	resetAll() {
		return this._shadow.resetAll();
	}

	onAnyChange() {
		return this._shadow.onAnyChange(...arguments);
	}

	destroy() {
		this.destroyed = true;
		crawlDown(this._shadow, option => callbackMaps.forEach(map => map.delete(option)));
		this._removeChangeListener && this._removeChangeListener(this.onChange);
	}
};


});
