'use strict'; define('web-ext-utils/options', [
], function(
) {

return function build({ defaults, prefix, storage, addChangeListener, }) {

const Defaults = new WeakMap;
const Values = new WeakMap;
const OnTrue = new WeakMap;
const OnFalse = new WeakMap;
const OnChange = new WeakMap;

const Options = new Map;

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

		this.children = new OptionList((_default.children || [ ]).map(child => new Option(child, this)));

		Options.set(this.path, this);
		return Object.freeze(this);
	}

	get value() { return Values.get(this).get(0); }
	set value(value) { return Values.get(this).set(0, value); }
	get values() { return Values.get(this); }
	set values(values) { return Values.get(this).replace(values); }

	whenTrue(listener) {
		const values = this.values;
		values.is && callAll([ listener, ], values.get(0), values, null, this.path);
		let listeners = OnTrue.get(this) || new Set;
		OnTrue.set(this, listeners);
		listeners.add(listener);
	}
	whenFalse(listener) {
		const values = this.values;
		!values.is && callAll([ listener, ], values.get(0), values, null, this.path);
		let listeners = OnFalse.get(this) || new Set;
		OnFalse.set(this, listeners);
		listeners.add(listener);
	}
	when(true_false) {
		true_false && true_false.true && this.whenTrue(true_false.true);
		true_false && true_false.false && this.whenFalse(true_false.false);
	}
	whenChange(listener) {
		const values = this.values;
		callAll([ listener, ], values.get(0), values, null, this.path);
		let listeners = OnChange.get(this) || new Set;
		OnChange.set(this, listeners);
		listeners.add(listener);
	}
	onChange(listener) {
		let listeners = OnChange.get(this) || new Set;
		OnChange.set(this, listeners);
		listeners.add(listener);
	}
}

class OptionList extends Array {
	constructor(items) {
		super();
		items.forEach((item, index, array) => this[item.name] = this[index] = item);
		return Object.freeze(this);
	}
}

class ValueList {
	constructor(parent, values) {
		this.parent = parent;

		this.key = prefix + this.parent.path;
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
		return storage.set({ [this.key]: values, });
	}
	replace(values) {
		if (values.length < this.min || values.length > this.max) {
			throw new Error('the number of values for the option "'+ this.key +'" must be between '+ this.min +' and '+ this.max);
		}
		this.parent.restrict && this.parent.restrict.validateAll(values, this.parent);
		return storage.set({ [this.key]: values, });
	}
	splice(index, remove, ...insert) {
		const values = Values.get(this).slice();
		values.splice.apply(values, arguments);
		if (values.length < this.min || values.length > this.max) {
			throw new Error('the number of values for the option "'+ this.key +'" must be between '+ this.min +' and '+ this.max);
		}
		this.parent.restrict && this.parent.restrict.validateAll(insert, this.parent, index);
		return storage.set({ [this.key]: values, });
	}
	reset() {
		return storage.remove(this.key);
	}
}

class Restriction {
	constructor(parent, restrict) {
		this._parent = parent;
		const from = this.from = restrict.from;
		const to = this.to = restrict.to;
		const match = this.match = restrict.match;
		const type = this.type = restrict.type;
		const unique = this.unique = Object.freeze(restrict.unique);
		const message = this.message = restrict.message;
		const checks = [ ];
		restrict.hasOwnProperty('from') && checks.push(value => value < from && ('This value must be at least '+ from));
		restrict.hasOwnProperty('to') && checks.push(value => value > to && ('This value can be at most '+ to));
		restrict.hasOwnProperty('match') && checks.push(value => !match.test(value) && (message ? message : ('This value must match '+ match)));
		restrict.hasOwnProperty('type') && checks.push(value => typeof value !== type && ('This value must be of type "'+ type +'" but is "'+ (typeof value) +'"'));
		restrict.hasOwnProperty('unique') && (() => {
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

const roots = new Option({ children: defaults, }, null).children;

addChangeListener((key, values) => {
	if (!key.startsWith(prefix)) { return; }
	const path = key.slice(prefix.length);
	const option = Options.get(path);
	!values && (values = option.defaults);
	const list = option.values;
	const old = Values.get(list);
	Values.set(list, values);

	const is = values.find(x => x);
	const was = old.find(x => x);

	callAll(OnChange.get(option), values[0], list, old, path);
	is && !was && callAll(OnTrue.get(option), values[0], list, old, path);
	!is && was && callAll(OnFalse.get(option), values[0], list, old, path);
});

return storage.get(Array.from(Options.keys()).map(path => prefix + path))
.then(data => {
	const { hasOwnProperty, } = Object.prototype;
	Options.forEach(option => Values.set(option, new ValueList(
		option,
		hasOwnProperty.call(data, prefix + option.path) ? data[prefix + option.path] : option.defaults
	)));
	return roots;
});

};

});
