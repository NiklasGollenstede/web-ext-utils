(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
}) => {

const queryChild = (() => {
	try { document.querySelector(':scope'); }
	catch (error) {
		return (element, ...selectors) =>
		selectors.reduce((element, selector) => element && Array.prototype.find.call(
			element.children,
			child => child.msMatchesSelector(selector)
		), element) || null;
	}
	return (element, ...selectors) => element.querySelector(':scope>'+ selectors.join('>'));
})();

const propsMap = new Map/*<id, props>*/;

return function loadEditor({ host, options, onCommand, }) {

	host.classList.add('options-host');

	host.addEventListener('click', ({ target, button, }) => {
		if (button || !target.matches) { return; }
		target.className.split(/\s+/).every(_class => { switch (_class) {
			case 'remove-value-entry': {
				const element = getParent(target, '.pref-container');
				target.parentNode.remove();
				setButtonDisabled(element);
				saveInput(element);
			} break;
			case 'add-value-entry': {
				const element = getParent(target, '.pref-container');
				const container = element.querySelector('.values-container');
				const row = container.appendChild(cloneInput(element.input));
				const props = element.pref.model.input;
				setInputRowValues(row, Array.isArray(props) ? props.map(_=>_.default) : props.default);
				setButtonDisabled(element);
				saveInput(row.querySelector('.input-field'));
			} break;
			case 'input-field': {
				if (target.type !== 'button') { return false; }
				const element = getParent(target, '.pref-container');
				const row = getParent(target, '.input-row');
				const index = Array.prototype.indexOf(row.parentNode, row);
				onCommand(element.pref, target.dataset.id, index);
			} break;
			default: { return true; }
		} return false; });
	});

	host.addEventListener('keypress', (event) => {
		const { target, } = event;
		if (!target.matches || !target.matches('.input-field') || target.dataset.type !== 'keybordKey') { return; }
		event.stopPropagation(); event.preventDefault();
		const key = (event.ctrlKey ? 'Ctrl+' : '') + (event.altKey ? 'Alt+' : '') + (event.shiftKey ? 'Shift+' : '') + event.code;
		target.value = key;
		saveInput(target);
	});
	host.addEventListener('change', ({ target, }) => {
		if (!target.matches || !target.matches('.input-field, .input-field *')) { return; }
		saveInput(getParent(target, '.input-field'));
	});

	if (!Array.isArray(options)) {
		options = options.constructor.name === 'OptionsRoot' ? options.children : [ options, ];
	}

	displayPreferences(options, host);
	return host;
};

function setButtonDisabled(element) {
	if (element.pref.model.disabled) {
		fieldsEnabled(element, 'model', false);
	}
	const container = queryChild(element, '*', '.values-container');
	const add       = queryChild(element, '*', '.add-value-entry');
	if (!add) { return; }
	const { min, max, } = element.pref.values, length = container.children.length;
	fieldEnabled(add, 'count', length < max);
	Array.prototype.forEach.call(container.querySelectorAll('.remove-value-entry'), remove => fieldEnabled(remove, 'count', length > min));
}

function fieldEnabled(field, reason, enabled) {
	const exp = new RegExp(String.raw`${ reason };|$`);
	const reasons = (field.getAttribute('disabled') || '').replace(exp, () => enabled ? '' : reason +';');
	field[(reasons ? 'set' : 'remove') +'Attribute']('disabled', reasons);
}

function fieldsEnabled(root, reason, enabled) {
	Array.prototype.forEach.call(root.querySelectorAll('textarea, input:not(.toggle-switch), select'), field => fieldEnabled(field, reason, enabled));
}

function saveInput(target) {
	const element = getParent(target, '.pref-container');
	const { pref, } = element;
	const values = Array.from(element.querySelector('.values-container').children, getInputRowValues);
	try {
		pref.values = values;
		Array.from(element.querySelectorAll('.invalid')).concat(element).forEach(invalid => {
			invalid.classList.remove('invalid');
			invalid.title = '';
		});
	} catch (error) {
		'index' in error && (target = element.querySelectorAll('.input-field')[error.index]);
		target.title = error && error.message || error;
		target.classList.add('invalid');
		throw error;
	}
}

function createInputRow(pref) {
	const { model, } = pref;

	return Object.assign(createElement('div', {
		className: 'input-row'+ (Array.isArray(model.input) ? '' : ' row-single'),
	}, [
		pref.values.max > pref.values.min && createElement('input', {
			title: 'remove this value',
			type: 'button',
			value: '-',
			className: 'remove-value-entry',
		}),
		model.input && createElement('div', {
			className: 'inputs-wrapper',
		}, (Array.isArray(model.input) ? model.input : [ model.input, ]).map(props => createElement('span', {
			className: 'input-wrapper', style: props.style || { },
		}, [
			props.prefix && createElement('span', {
				innerHTML: sanatize(props.prefix),
				className: 'value-prefix',
			}),
			createInput(props),
			props.suffix && createElement('span', {
				innerHTML: sanatize(props.suffix),
				className: 'value-suffix',
			}),
		]))),
	]), {
		pref,
	});
}

/// returns a single .input-field field of a given type
function createInput(props) {
	const inputProps = {
		className: 'input-field',
		dataset: {
			type: props.type,
		},
		placeholder: props.placeholder || '',
	};
	let input; switch (props.type) {
		case 'menulist': {
			input = createElement('select', inputProps, (props.options || [ ]).map(option => createElement('option', {
				value: option.value,
				textContent: option.label,
			})));
		} break;
		case 'text': case 'code': {
			input = createElement('textarea', inputProps);
		} break;
		case 'control': {
			Object.assign(inputProps, {
				value: props.label,
				dataset: { id: props.id, },
			});
		} /* falls through */
		default: {
			input = createElement('input', inputProps);
			input.type = ({
				control: 'button',
				bool: 'checkbox',
				boolInt: 'checkbox',
				integer: 'number',
				string: 'text',
				keybordKey: 'text',
				color: 'color',
				label: 'hidden',
			})[props.type] || props.type;
		}
	}
	if (props.type === 'number') { input.step = 'any'; }
	if (input.type === 'checkbox') {
		input.className = '';
		input.id = 'l'+ Math.random().toString(36).slice(2);
		input = createElement('div', { className: 'checkbox-wrapper input-field', }, [
			input,
			createElement('label', { htmlFor: input.id, }),
		]);
	}
	input.id = 'i'+ Math.random().toString(36).slice(2);
	propsMap.set(input.id, props);
	return input;
}

function setInputRowValues(row, values) {
	if (row.matches('.row-single')) { values = [ values, ]; }
	row.querySelectorAll('.input-field').forEach((input, index) => setInputValue(input, values[index]));
}

function setInputValue(input, value) {
	const props = propsMap.get(input.id);
	switch (props.type) {
		case 'checkbox':
		case 'bool':    input.firstChild.checked = value; break;
		case 'boolInt': input.firstChild.checked = (value === props.on); break;
		case 'menulist':input.selectedIndex = (props.options || []).findIndex(option => option.value === value); break;
		case 'control': break;
		default:        input.value !== value && (input.value = value); break;
	}
}

function getInputRowValues(row) {
	const values = Array.from(row.querySelectorAll('.input-field'), getInputValue);
	return row.matches('.row-single') ? values[0] : values;
}

function getInputValue(input) {
	const props = propsMap.get(input.id);
	switch (props.type) {
		case 'checkbox':
		case 'bool':      return input.firstChild.checked;
		case 'boolInt':   return input.firstChild.checked ? props.on : props.off;
		case 'menulist':  return props.options && props.options[input.selectedIndex].value;
		case 'number':    return +input.value;
		case 'integer':   return Math.round(+input.value);
		case 'control':   return true;
		default:          return input.value;
	}
}

function cloneInput(input) {
	const clone = input.cloneNode(true);
	clone.pref = input.pref;
	return clone;
}

function getParent(element, selector) {
	while (element && (!element.matches || !element.matches(selector))) { element = element.parentNode; }
	return element;
}

function createElement(tagName, properties, childList) {
	const element = document.createElement(tagName);
	if (Array.isArray(properties)) { childList = properties; properties = null; }
	properties && copyProperties(element, properties);
	for (let i = 0; childList && i < childList.length; ++i) {
		childList[i] && element.appendChild(childList[i]);
	}
	return element;
}

function copyProperties(target, source) {
	source && Object.keys(source).forEach(key => {
		if (Object.prototype.toString.call(source[key]) === '[object Object]') {
			!target[key] && (target[key] = { });
			copyProperties(target[key], source[key]);
		} else if (Array.isArray(source[key])) {
			!target[key] && (target[key] = [ ]);
			copyProperties(target[key], source[key]);
		} else {
			target[key] = source[key];
		}
	});
	return target;
}

function sanatize(html) {
	const allowed = /^(a|b|big|br|code|div|i|p|pre|kbd|li|ol|ul|spam|span|sup|sub|tt|var)$/;
	return html.replace(
		(/<(\/?)(\w+)[^>]*?( href="(?!(javascript|data):)[^"]*?")?( title="[^"]*?")?[^>]*?>/g),
		(match, slash, tag, href, title) => allowed.test(tag) ? ('<'+ slash + tag + (title || '') + (href ? href +'target="_blank"' : '') +'>') : ''
	);
}

function displayPreferences(prefs, host) { prefs.forEach(pref => {
	const { model, } = pref;
	if (model.hidden) { return; }

	const input = createInputRow(pref);
	const labelId = model.expanded != null && 'l'+ Math.random().toString(36).slice(2);

	let valuesContainer, childrenContainer;
	const element = host.appendChild(createElement('div', {
		className: 'pref-container pref-name-'+ pref.name,
	}, [
		labelId && createElement('input', {
			type: 'checkbox', className: 'toggle-switch', id: labelId, checked: model.expanded,
		}),
		model.title && createElement('label', {
			className: 'toggle-switch', htmlFor: labelId,
		}, [
			labelId && createElement('span', {
				textContent: '➤', className: 'toggle-marker',
			}),
			createElement('span', {
				textContent: model.title, className: 'pref-title',
			}),
		]),
		model.title && createElement('div', { className: 'reset-values', }, [ createElement('a', {
			textContent: 'reset',
			title: `Double click to reset this option and all it's children to their default values`,
			ondblclick: ({ button, }) => !button && pref.resetAll(),
		}), ]),

		createElement('div', { className: 'toggle-target', }, [
			model.description && createElement('span', {
				innerHTML: sanatize(model.description), className: 'pref-description',
			}),
			valuesContainer = createElement('div', {
				className: 'values-container',
			}),
			pref.values.max > pref.values.min && createElement('input', {
				title: 'add a value',
				type: 'button',
				value: '+',
				className: 'add-value-entry',
				dataset: {
					maxLength: model.maxLength,
					minLength: model.minLength || 0,
				},
			}),
			childrenContainer = pref.children.filter(({ type, }) => type !== 'hidden').length && displayPreferences(
				pref.children,
				createElement('fieldset', { className: 'pref-children', })
			),
		]),
	]));
	Object.assign(element, { pref, input, });

	pref.whenChange((_, { current: values, }) => {
		while (valuesContainer.children.length < values.length) { valuesContainer.appendChild(cloneInput(input)); }
		while (valuesContainer.children.length > values.length) { valuesContainer.lastChild.remove(); }
		values.forEach((value, index) => setInputRowValues(valuesContainer.children[index], value));
		setButtonDisabled(element);
	});

	childrenContainer && pref.when({
		true: () => fieldsEnabled(childrenContainer, pref.path, true),
		false: () => fieldsEnabled(childrenContainer, pref.path, false),
	});

	setButtonDisabled(element);
}); return host; }

}); })(this);
