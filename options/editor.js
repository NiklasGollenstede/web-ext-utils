'use strict'; define('web-ext-utils/options/editor', function() {

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
	const container = element.querySelector(':scope>*>.values-container');
	const add = element.querySelector(':scope>*>.add-value-entry');
	if (!add) { return; }
	const { min, max, } = element.pref.values, length = container.children.length;
	fieldEnabled(add, 'count', length < max);
	Array.prototype.forEach.call(container.querySelectorAll('.remove-value-entry'), remove => fieldEnabled(remove, 'count', length > min));
}

function fieldEnabled(field, reason, enabled) {
	const exp = new RegExp(String.raw`${ reason };|$`);
	let reasons = (field.getAttribute('disabled') || '').replace(exp, () => enabled ? '' : reason +';');
	field[(reasons ? 'set' : 'remove') +'Attribute']('disabled', reasons);
}

function fieldsEnabled(root, reason, enabled) {
	Array.prototype.forEach.call(root.querySelectorAll('textarea, input, select'), field => fieldEnabled(field, reason, enabled));
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
					className: 'value-infix'
				}),
				createElement('input', { type: 'number', step: 'any', }),
			]);
		} break;
		case 'text': {
			input = createElement('textarea', inputProps);
		} break;
		default: {
			input = createElement('input', Object.assign(inputProps, {
				step: pref.type === 'integer' ? 1 : 'any',
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
			}));
		}
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
			className: 'value-prefix'
		}),
		input,
		pref.suffix && createElement('span', {
			innerHTML: sanatize(pref.suffix),
			className: 'value-suffix'
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

function getParent(element, selector) {
	while (element && (!element.matches || !element.matches(selector))) { element = element.parentNode; }
	return element;
}

function createElement(tagName, properties, childList) {
	const element = (this || window).document.createElement(tagName);
	if (Array.isArray(properties)) { childList = properties; properties = null; }
	properties && copyProperties(element, properties);
	for (var i = 0; childList && i < childList.length; ++i) {
		childList[i] && element.appendChild(childList[i]);
	}
	return element;
}

function copyProperties(target, source) {
	source && Object.keys(source).forEach(function(key) {
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

function displayPreferences(prefs, host, parent = null) {
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
				labelId && createElement('h1', {
					textContent: '➤', className: 'toggle-marker',
				}),
				createElement('h1', {
					textContent: pref.title || pref.name,
				}),
			]),

			createElement('div', { className: 'toggle-target', }, [
				pref.description && createElement('h3', {
					innerHTML: sanatize(pref.description), classList: 'description',
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
					createElement('fieldset', { className: 'pref-children', }),
					pref
				),
			]),
		])), { pref, input, });

		pref.whenChange((_, { current: values, }) => {
			while (valuesContainer.children.length < values.length) { valuesContainer.appendChild(cloneInput(input)); }
			while (valuesContainer.children.length > values.length) { valuesContainer.lastChild.remove(); }
			values.forEach((value, index) => setInputValue(valuesContainer.children[index], value));
		});

		childrenContainer && pref.type !== 'label' && pref.when({
			true: () => fieldsEnabled(childrenContainer, pref.path, true),
			false: () => fieldsEnabled(childrenContainer, pref.path, false),
		});

		setButtonDisabled(element);
	});
	return host;
}

});
