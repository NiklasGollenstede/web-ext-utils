'use strict'; define('web-ext-utils/options/editor', [
	'es6lib'
], function(
	{ dom: { createElement, getParent, }, }
) {

return function loadEditor({ host, options, onCommand, }) {

	host.addEventListener('click', function({ target, button, }) {
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
				if (target.dataset.type !== 'control') { return; }
				console.log('button clicked', target);
				onCommand(target.parentNode.pref, target.dataset.value);
			} break;
			default: { return true; }
		} });
	});

	host.addEventListener('keypress', function(event) {
		const { target, } = event;
		if (!target.matches || !target.matches('.value-input') || target.dataset.type !== 'keybordKey') { return; }
		event.stopPropagation(); event.preventDefault();
		const key = (event.ctrlKey ? 'Ctrl+' : '') + (event.altKey ? 'Alt+' : '') + (event.shiftKey ? 'Shift+' : '') + event.code;
		target.value = key;
		saveInput(target);
	});
	host.addEventListener('change', function({ target, }) {
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
	const container = element.querySelector(':scope>.values-container');
	const add = element.querySelector(':scope>.add-value-entry');
	if (!add) { return; }
	const { min, max, } = element.pref.values, length = container.children.length;
	add.disabled = length >= max;
	Array.prototype.forEach.call(container.querySelectorAll('.remove-value-entry'), remove => remove.disabled = length <= min);
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
	return Object.assign(createElement('div', {
		className: 'value-container',
	}, [
		pref.values.max > pref.values.min && createElement('input', {
			title: 'remove this value',
			type: 'button',
			value: '-',
			className: 'remove-value-entry',
		}),
		pref.type === 'menulist'
		? createElement('select', {
			name: pref.name,
			className: 'value-input',
			dataset: {
				type: pref.type,
			},
		}, (pref.options || [ ]).map(option => createElement('option', {
			value: option.value,
			textContent: option.label,
		})))
		: pref.type === 'interval'
		? createElement('span', {
			name: pref.name,
			className: 'value-input',
			dataset: {
				type: pref.type,
			},
		}, [
			createElement('input', { type: 'number', step: 'any', }),
			createElement('b', { textContent: '  -  ', }),
			createElement('input', { type: 'number', step: 'any', }),
		])
		: createElement('input', {
			name: pref.name,
			className: 'value-input',
			dataset: {
				type: pref.type,
			},
			step: 'any',
			type: {
				control: 'button',
				bool: 'checkbox',
				boolInt: 'checkbox',
				integer: 'number',
				string: 'text',
				keybordKey: 'text',
				color: 'color',
				label: 'hidden',
			}[pref.type] || pref.type,
		}),
		pref.unit && createElement('span', {
			textContent: pref.unit,
			className: 'value-unit'
		}),
	]), {
		pref,
	});
}

function setInputValue(input, value) {
	const { pref, } = input, field = input.querySelector(':scope>.value-input');
	switch (pref.type) {
		case "bool":
			field.checked = value;
			break;
		case "boolInt":
			field.checked = (value === pref.on);
			break;
		case "menulist": {
			field.selectedIndex = (pref.options || []).findIndex(option => option.value === value);
		} break;
		case "interval": {
			field.firstChild.value = value && value.from || 0;
			field.lastChild.value = value && value.to || 0;
		} break;
		case "label":
			break;
		case "control":
			field.dataset.value = value;
			/* falls through */
		default:
			field.value = value;
			break;
	}
	return input;
}

function getInputValue(input) {
	const { pref, } = input, field = input.querySelector(':scope>.value-input');
	switch (pref.type) {
		case "control":
			return field.dataset.value;
		case "bool":
			return field.checked;
		case "boolInt":
			return field.checked ? pref.on : pref.off;
		case "menulist":
			return pref.options && pref.options[field.selectedIndex].value;
		case "number":
		case "integer":
			return +field.value;
		case "interval": {
			return { from: +field.firstChild.value, to: +field.lastChild.value, };
		} break;
		case "label":
			return undefined;
		default:
			return field.value;
	}
}

function cloneInput(input) {
	const clone = input.cloneNode(true);
	clone.pref = input.pref;
	return clone;
}

function sanatize(html) {
	const allowed = /^(a|b|big|br|code|div|i|p|pre|li|ol|ul|span|sup|sub|tt)$/;
	return html.replace(
		(/<(\/?)(\w+)[^>]*?( href="(?!(javascript|data):)[^"]*?")?( title="[^"]*?")?[^>]*?>/g),
		(match, slash, tag, href, title) => allowed.test(tag) ? ('<'+ slash + tag + (title || '') + (href ? href +'target="_blank"' : '') +'>') : ''
	);
}

function displayPreferences(prefs, host, parent = null) {
	prefs.forEach(pref => {
		if (pref.type === 'hidden') { return; }

		const input = createInput(pref);

		let valuesContainer;
		const element = Object.assign(host.appendChild(createElement('div', {
			className: 'pref-container type-'+ pref.type,
		}, [
			createElement('h1', {
				textContent: pref.title || pref.name,
			}),
			pref.description && createElement('h3', {
				innerHTML: sanatize(pref.description),
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
			pref.children.length && displayPreferences(
				pref.children,
				createElement('fieldset', {
					className: 'pref-children'+ (pref.type === 'label' || pref.values.is ? '' : 'disabled'),
				}),
				pref
			),
		])), { pref, input, });

		pref.whenChange((_, { current: values, }) => {
			while (valuesContainer.children.length < values.length) { valuesContainer.appendChild(cloneInput(input)); }
			while (valuesContainer.children.length > values.length) { valuesContainer.lastChild.remove(); }
			values.forEach((value, index) => setInputValue(valuesContainer.children[index], value));
		});

		setButtonDisabled(element);
	});
	return host;
}

});
