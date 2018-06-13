(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
}) => {

const queryChild = (() => {
	try { global.document.querySelector(':scope'); }
	catch (error) {
		return (element, ...selectors) =>
		selectors.reduce((element, selector) => element && Array.prototype.find.call(
			element.children,
			child => child.msMatchesSelector(selector)
		), element) || null;
	}
	return (element, ...selectors) => element.querySelector(':scope>'+ selectors.join('>'));
})();

const propsMap = new Map/*<id, props>*/; let window = null;

/* export */ function loadEditor({ host, options, onCommand, prefix = '', }) {

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
				if (target.dataset.type === 'control') {
					const element = getParent(target, '.pref-container');
					const row = getParent(target, '.input-row');
					const index = Array.prototype.indexOf(row.parentNode, row);
					onCommand(element.pref, target.dataset.id, index);
				} else if (target.dataset.type === 'random') {
					target.dataset.value = Math.random().toString(32).slice(2);
					saveInput(getParent(target, '.input-field'));
				}
			} break;
			case 'toggle-switch': case 'toggle-marker': case 'pref-title': {
				host.dataset.resize = true; // cause the inline options frame in Firefox to resize
			} break;
			default: { return true; }
		} return false; });
	});

	host.addEventListener('keypress', (event) => {
		const { target, } = event;
		if (!target.matches || !target.matches('.input-field')) { return; }
		switch (target.dataset.type) {
			case 'keybordKey': {
				target.value = (event.ctrlKey ? 'Ctrl+' : '') + (event.altKey ? 'Alt+' : '') + (event.shiftKey ? 'Shift+' : '') + event.code;
			} break;
			case 'command': {
				if (event.key === 'Unidentified' || event.key === 'Dead') { return; }
				const media = (/^Media(?:PlayPause|Stop|Track(Previous|Next))$/).exec(event.code);
				if (media) { target.value = media[1] ? `Media${ media[1].slice(0, 4) }Track` : media[0]; break; }
				const funcKey = (/F[1-9]|F1[0-2]/).test(event.code);
				if (!event.ctrlKey && !event.altKey && !event.metaKey && !funcKey) { return; }
				if (event.ctrlKey + event.altKey + event.metaKey > 1) { return; }
				const mod = (event.ctrlKey ? 'Ctrl + ' : '') + (event.altKey ? 'Alt + ' : '') + (event.shiftKey ? 'Shift + ' : '');
				const key = event.code.replace(/^Key|^Digit|^Numpad|^Arrow/, '');
				if (!funcKey && !(/^(?:[A-Z0-9]|Comma|Period|Home|End|PageUp|PageDown|Space|Insert|Delete|Up|Down|Left|Right)$/).test(key)) { return; }
				target.value = mod + key;
			} break;
			default: return;
		}
		event.stopPropagation(); event.preventDefault();
		saveInput(target);
	});
	host.addEventListener('change', ({ target, }) => {
		if (!target.matches || !target.matches('.input-field, .input-field *')) { return; }
		saveInput(getParent(target, '.input-field'));
	});
	host.addEventListener('focus', ({ target: input, }) => {
		if (!input.matches('.dynamic-select')) { return; }
		const element = getParent(input, '.pref-container');
		const props = propsMap.get(input.id);
		const value = getInputValue(input);
		setSelectOptions(input, props.getOptions(element.pref));
		value !== undefined && setInputValue(input, value);
	}, true);

	if (!Array.isArray(options)) {
		options = options.constructor.name === 'OptionsRoot' ? options.children : [ options, ];
	}

	try {
		window = host.ownerDocument.defaultView;
		displayPreferences(options, host, prefix);
	} finally { window = null; }
	return host;
}

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
	let error; try { pref.values.replace(values); } catch (e) { error = e; }
	Array.from(element.querySelectorAll('.invalid')).concat(element).forEach(invalid => {
		invalid.classList.remove('invalid'); invalid.removeAttribute('title');
	});
	if (error) {
		if ('index' in error) {
			const wrapper = element.querySelector('.values-container').children[error.index];
			!wrapper.contains(target) && (target = wrapper);
		}
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
		}, (
			Array.isArray(model.input) ? model.input : [ model.input, ]
		).map(props => createElement('span', {
			className: 'input-wrapper', style: props.style || { },
		}, [
			props.prefix && createElement('span', {
				innerHTML: sanatize(props.prefix),
				className: 'value-prefix',
			}),
			createInput(props, pref),
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
function createInput(props, pref) {
	const inputProps = {
		className: 'input-field',
		dataset: { type: props.type, },
		placeholder: props.placeholder || '',
	};
	let input; switch (props.type) {
		case 'select': case 'menulist': {
			input = createElement('select', inputProps);
			if (typeof props.getOptions === 'function') {
				input.classList.add('dynamic-select');
				setSelectOptions(input, typeof props.getCurrent === 'function' ? [ props.getCurrent(pref), ] : props.getOptions(pref));
			} else if (props.options) {
				setSelectOptions(input, props.options);
			}
		} break;
		case 'text': case 'code': {
			input = createElement('textarea', inputProps);
		} break;
		case 'random': case 'control': {
			Object.assign(inputProps, {
				value: props.label,
				dataset: { id: props.id, type: props.type, },
			});
		} /* falls through */
		default: {
			input = createElement('input', inputProps);
			input.type = ({
				control: 'button',
				random: 'button',
				boolean: 'checkbox',
				boolInt: 'checkbox',
				integer: 'number',
				string: 'text',
				keybordKey: 'text',
				command: 'text',
				color: 'color',
				label: 'hidden',
			})[props.type] || props.type;
		}
	}
	if (props.type === 'number') { input.step = 'any'; }
	if (input.type === 'checkbox') {
		input.className = '';
		input.id = 'l'+ Math.random().toString(32).slice(2);
		input = createElement('div', { className: 'checkbox-wrapper input-field', }, [
			input,
			createElement('label', { htmlFor: input.id, }),
		]);
	}
	input.id = 'i'+ Math.random().toString(32).slice(2);
	propsMap.set(input.id, props);
	return input;
}

function setSelectOptions(select, options) {
	select.textContent = '';
	options.forEach(option => {
		select.appendChild(createElement('option', {
			value: option.value,
			textContent: option.label,
			disabled: option.disabled,
		}));
	});
}

function setInputRowValues(row, values) {
	if (row.matches('.row-single')) { values = [ values, ]; }
	row.querySelectorAll('.input-field').forEach((input, index) => setInputValue(input, values[index]));
}

function setInputValue(input, value) {
	const props = propsMap.get(input.id);
	switch (props.type) {
		case 'checkbox':
		case 'boolean': input.firstChild.checked = value; break;
		case 'boolInt': input.firstChild.checked = (value === props.on); break;
		case 'menulist':input.selectedIndex = (props.options || Array.from(input)).findIndex(option => option.value == value); break; // eslint-disable-line eqeqeq
		case 'random':  input.dataset.value = value; break;
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
		case 'boolean':   return input.firstChild.checked;
		case 'boolInt':   return input.firstChild.checked ? props.on : props.off;
		case 'menulist':  return (props.map || (_=>_))(((props.options || Array.from(input))[input.selectedIndex] || { }).value);
		case 'number':    return +input.value;
		case 'integer':   return Math.round(+input.value);
		case 'random':    return input.dataset.value;
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
	const element = window.document.createElement(tagName);
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
	const parts = (html ? html +'' : '').split(rTag);
	return parts.map((s, i) => i % 2 ? s : s.replace(rEsc, c => oEsc[c])).join('');
}
const rTag = /(&(?:[A-Za-z]+|#\d+|#x[0-9A-Ea-e]+);|<\/?(?:a|abbr|b|br|code|details|em|i|p|pre|kbd|li|ol|ul|small|spam|span|strong|summary|sup|sub|tt|var)(?: download(?:="[^"]*")?)?(?: href="(?!(?:javascript|data):)[^\s"]*?")?(?: title="[^"]*")?>)/;
const oEsc = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '/': '&#47;', };
const rEsc = new RegExp('['+ Object.keys(oEsc).join('') +']', 'g');

function displayPreferences(prefs, host, prefix) { prefs.forEach(pref => {
	const { model, } = pref;
	if (model.hidden) { return; }

	const input = createInputRow(pref);
	const labelId = model.expanded != null && 'l'+ Math.random().toString(32).slice(2);

	let valuesContainer; const childrenContainer = pref.children.filter(({ type, }) => type !== 'hidden').length
	&& createElement('fieldset', { className: 'pref-children', });

	const element = host.appendChild(createElement('div', {
		className: 'pref-container pref-name-'+ pref.name,
		id: prefix + pref.path,
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
			title: `Double click to reset this option and all its children to their default values`,
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
			childrenContainer,
		]),
	]));
	Object.assign(element, { pref, input, });

	pref.whenChange(values => {
		while (valuesContainer.children.length < values.length) { valuesContainer.appendChild(cloneInput(input)); }
		while (valuesContainer.children.length > values.length) { valuesContainer.lastChild.remove(); }
		values.forEach((value, index) => setInputRowValues(valuesContainer.children[index], value));
		setButtonDisabled(element);
	}, { owner: window, });

	childrenContainer && displayPreferences(pref.children, childrenContainer, prefix);
	childrenContainer && (model.enableIf ? pref.whenChange(([ value, ]) => {
		fieldsEnabled(childrenContainer, pref.path, model.enableIf.includes(value));
	}) : pref.when({
		true: () => fieldsEnabled(childrenContainer, pref.path, true),
		false: () => fieldsEnabled(childrenContainer, pref.path, false),
	}));

	setButtonDisabled(element);
}); return host; }

return loadEditor;

}); })(this);
