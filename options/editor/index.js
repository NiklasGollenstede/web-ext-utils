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
				element.pref.hasOwnProperty('addDefault') && setInputValue(row, element.pref.addDefault);
				setButtonDisabled(element);
				saveInput(row.querySelector('.value-input'));
			} break;
			case 'value-input': {
				if (target.dataset.type !== 'control') { return false; }
				onCommand(target.parentNode.pref, target.dataset.value);
			} break;
			default: { return true; }
		} return false; });
	});

	host.addEventListener('keypress', (event) => {
		const { target, } = event;
		if (!target.matches || !target.matches('.value-input') || target.dataset.type !== 'keybordKey') { return; }
		event.stopPropagation(); event.preventDefault();
		const key = (event.ctrlKey ? 'Ctrl+' : '') + (event.altKey ? 'Alt+' : '') + (event.shiftKey ? 'Shift+' : '') + event.code;
		target.value = key;
		saveInput(target);
	});
	host.addEventListener('change', ({ target, }) => {
		if (!target.matches || !target.matches('.value-input, .value-input *')) { return; }
		saveInput(getParent(target, '.value-input'));
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
	const values = Array.prototype.map.call(element.querySelector('.values-container').children, getInputValue);
	try {
		pref.values = values;
		Array.from(element.querySelectorAll('.invalid')).concat(element).forEach(invalid => {
			invalid.classList.remove('invalid');
			invalid.title = '';
		});
	} catch (error) {
		'index' in error && (target = element.querySelectorAll('.value-input')[error.index]);
		target.title = error && error.message || error;
		target.classList.add('invalid');
		throw error;
	}
}

function createInput(pref) {
	const inputProps = {
		name: pref.name,
		className: 'value-input',
		dataset: {
			type: pref.type,
		},
		placeholder: pref.placeholder || '',
	};
	let input; switch (pref.type) {
		case 'menulist': {
			input = createElement('select', inputProps, (pref.options || [ ]).map(option => createElement('option', {
				value: option.value,
				textContent: option.label,
			})));
		} break;
		case 'interval': {
			input = createElement('span', inputProps, [
				createElement('input', { type: 'number', step: 'any', }),
				createElement('span', {
					innerHTML: sanatize(pref.infix || '  -  '),
					className: 'value-infix',
				}),
				createElement('input', { type: 'number', step: 'any', }),
			]);
		} break;
		case 'text': {
			input = createElement('textarea', inputProps);
		} break;
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
			})[pref.type] || pref.type;
		}
	}
	if (pref.type === 'number') { input.step = 'any'; }
	if (input.type === 'checkbox') {
		input.id = 'l'+ Math.random().toString(36).slice(2);
		input = createElement('div', { className: 'checkbox-wrapper value-input', }, [
			input,
			createElement('label', { htmlFor: input.id, }),
		]);
	}
	return Object.assign(createElement('div', {
		className: 'value-container',
	}, [
		pref.values.max > pref.values.min && createElement('input', {
			title: 'remove this value',
			type: 'button',
			value: '-',
			className: 'remove-value-entry',
		}),
		pref.prefix && createElement('span', {
			innerHTML: sanatize(pref.prefix),
			className: 'value-prefix',
		}),
		input,
		pref.suffix && createElement('span', {
			innerHTML: sanatize(pref.suffix),
			className: 'value-suffix',
		}),
	]), {
		pref,
	});
}

function setInputValue(input, value) {
	const { pref, } = input, field = queryChild(input, '.value-input');
	switch (pref.type) {
		case "bool":
			field.firstChild.checked = value;
			break;
		case "boolInt":
			field.firstChild.checked = (value === pref.on);
			break;
		case "menulist": {
			field.selectedIndex = (pref.options || []).findIndex(option => option.value === value);
		} break;
		case "interval": {
			const from = value && value.from || 0;
			from !== field.firstChild.value && (field.firstChild.value = from);
			const to = value && value.to || 0;
			to !== field.lastChild.value && (field.lastChild.value = to);
		} break;
		case "label":
			break;
		case "control":
			field.dataset.value = value;
			/* falls through */
		default:
			value !== field.value && (field.value = value);
			break;
	}
	return input;
}

function getInputValue(input) {
	const { pref, } = input, field = queryChild(input, '.value-input');
	switch (pref.type) {
		case "control":
			return field.dataset.value;
		case "bool":
			return field.firstChild.checked;
		case "boolInt":
			return field.firstChild.checked ? pref.on : pref.off;
		case "menulist":
			return pref.options && pref.options[field.selectedIndex].value;
		case "number":
		case "integer":
			return +field.value;
		case "interval":
			return { from: +field.firstChild.value, to: +field.lastChild.value, };
		case "label":
			return null;
		default:
			return field.value;
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
	const allowed = /^(a|b|big|br|code|div|i|p|pre|li|ol|ul|span|sup|sub|tt)$/;
	return html.replace(
		(/<(\/?)(\w+)[^>]*?( href="(?!(javascript|data):)[^"]*?")?( title="[^"]*?")?[^>]*?>/g),
		(match, slash, tag, href, title) => allowed.test(tag) ? ('<'+ slash + tag + (title || '') + (href ? href +'target="_blank"' : '') +'>') : ''
	);
}

function displayPreferences(prefs, host) {
	prefs.forEach(pref => {
		if (pref.type === 'hidden') { return; }

		const input = createInput(pref);
		const labelId = pref.expanded != null && 'l'+ Math.random().toString(36).slice(2);

		let valuesContainer, childrenContainer;
		const element = Object.assign(host.appendChild(createElement('div', {
			className: 'pref-container type-'+ pref.type +' pref-name-'+ pref.name,
		}, [
			labelId && createElement('input', {
				type: 'checkbox', className: 'toggle-switch', id: labelId, checked: pref.expanded,
			}),
			createElement('label', {
				className: 'toggle-switch', htmlFor: labelId,
			}, [
				labelId && createElement('span', {
					textContent: '➤', className: 'toggle-marker',
				}),
				createElement('span', {
					textContent: pref.title || pref.name, className: 'pref-title',
				}),
			]),
			(pref.type !== 'label' && pref.type !== 'control' || pref.children.some(({ type, }) => type !== 'hidden' && type !== 'label' && type !== 'control'))
			&& createElement('div', { className: 'reset-values', }, [ createElement('a', {
				textContent: 'reset',
				title: `Double click to reset this option and all it's children to their default values`,
				ondblclick: ({ button, }) => !button && pref.resetAll(),
			}), ]),

			createElement('div', { className: 'toggle-target', }, [
				pref.description && createElement('span', {
					innerHTML: sanatize(pref.description), className: 'pref-description',
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
						maxLength: pref.maxLength,
						minLength: pref.minLength || 0,
					},
				}),
				childrenContainer = pref.children.filter(({ type, }) => type !== 'hidden').length && displayPreferences(
					pref.children,
					createElement('fieldset', { className: 'pref-children', })
				),
			]),
		])), { pref, input, });

		pref.whenChange((_, { current: values, }) => {
			while (valuesContainer.children.length < values.length) { valuesContainer.appendChild(cloneInput(input)); }
			while (valuesContainer.children.length > values.length) { valuesContainer.lastChild.remove(); }
			values.forEach((value, index) => setInputValue(valuesContainer.children[index], value));
			setButtonDisabled(element);
		});

		childrenContainer && pref.when({
			true: () => fieldsEnabled(childrenContainer, pref.path, true),
			false: () => fieldsEnabled(childrenContainer, pref.path, false),
		});

		setButtonDisabled(element);
	});
	return host;
}

}); })(this);
