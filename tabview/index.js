(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../utils/': { reportError, },
	'../../es6lib/dom': { createElement, },
}) => {

const styles = {
	default: `/* default */
		.content, .tablist, .tab {
			box-sizing: border-box;
			font-family: "Segoe UI";
		}
		.content {
			position: absolute;
			overflow: auto;
		}
		.tabwrapper {
			position: absolute;
			overflow: hidden;
		}
		.tablist {
			position: absolute;
			top: 0px; right: 0px; bottom: 0px; left: 0px;
			overflow: auto;
		}
		.tab {
			border-color: transparent;
			border-style: solid;
			border-width: 0;
			transition-property: color, fill, background-color, border-color;
			transition-duration: 0.21s;
			cursor: pointer;
			-webkit-user-select: none;
			-moz-user-select: none;
			position: relative;
		}
		.tab>.icon {
			display: inline-block;
			background-size: 100%;
			background-repeat: no-repeat;
			background-position: center center;
			text-align: center;
		}
		.tab>.icon.missing {
			display: none;
		}
		.tab>.title {
		}
	`,
	vertical: `/* vertical */
		.content {
			top: 0px; height: 100%;
			right: 0px; width: calc(100% - 200px);
			transition: width 0.16s;
		}
		.tabwrapper {
			top: 0px; height: 100%;
			left: 0px; width: 200px;
			transition: width 0.16s;
		}
		.tablist {
			padding-top: 54px;
			overflow-y: scroll;
			overflow-x: hidden;
			margin-right: -17px;
		}
		.tab {
			height: 54px;
			line-height: 54px;
			font-size: 24px;
			border-left-width: 5px;
			padding: 3px;
		}
		.tab>.icon {
			height: 48px;
			width: 48px;
		}
		.tab>.title {
			position: absolute;
			top: 0px;
			right: 0px;
			left: 56px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		@media (max-width: 900px) {
			.tabwrapper {
				width: 60px;
			}
			.content {
				width: calc(100% - 60px);
			}
			.tab .missing + .title {
				left: 8px;
				text-overflow: hidden;
			}
		}
	`,
	horizontal: `/* horizontal */
		.content {
			left: 0px; width: 100%;
			bottom: 0px; height: calc(100% - 40px);
		}
		.tabwrapper {
			left: 0px; width: 100%;
			top: 0px; height: 40px;
		}
		.tablist {
			/*overflow-y: hidden;*/
			/*overflow-x: scroll;*/
			/*margin-bottom: -17px;*/
		}
		.tab {
			float: left;
			height: 100%;
			line-height: 35px;
			padding-left: 0px;
			padding-right: 10px;
			border-bottom-width: 5px;
			padding: 6px;
		}
		.tab>.icon {
			height: 24px;
			width: 24px;
		}
		.tab>.title {
			position: relative;
			display: inline-block;
			height: 100%;
			line-height: 23px;
			padding-left: 4px;
			min-width: 6em;
			max-width: 12em;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	`,
	firefox: `/* firefox */
		.tablist {
			background-color: #424F5A;
		}
		.tab.active {
			color: #F2F2F2;
			border-color: orange;
			background-color: #343F48;
		}
		.tab:not(.active):hover {
			background-color: #5E6972;
		}
		.tab {
			color: #C1C1C1;
		}
	`,
};

return class TabView {
	constructor({ host, content, tabs, active, onSelect, style, }) {
		this.style = host.appendChild(createElement('style', {
			scoped: true,
			textContent: typeof style !== 'string' ? '' : styles.default + style.split(' ').map(style => styles[style]).join('\n'),
		}));
		this.tabwrapper = host.appendChild(createElement('div', {
			classList: 'tabwrapper',
		}, [
			this.tablist = createElement('div', {
				classList: 'tablist',
			}),
		]));
		this.content = host.appendChild(content);
		this.content.classList = 'content';
		tabs.forEach(tab => this.add(tab));
		this.onSelect = onSelect;
		this.active = active;
	}

	set active(id) {
		const old = this.tablist.querySelector(':scope>.tab.active');
		if (old && old.dataset.id === id) { return; }
		old && old.classList.remove('active');
		const now = this.get(id);
		now.classList.add('active');
		try { this.onSelect && this.onSelect(now); } catch (error) { reportError(`Failed to navigate tabview`, error); }
	}
	get active() {
		return this.tablist.querySelector(':scope>.tab.active').id;
	}

	add({ id, position = Infinity, data, }) {
		this.tablist.insertBefore(createElement('div', {
			className: 'tab',
			id: id, dataset: { id, },
			data: data !== undefined ? data : { },
			onclick: ({ button, }) => !button && (this.active = id),
		}, [
			createElement('span', { classList: 'title', }),
			createElement('div', { classList: 'icon', }),
		]), this.tablist.children[position]);
		this.set(arguments[0]);
	}

	set(props) {
		const tab = this.get(props.id);
		'title' in props && (tab.querySelector('.title').textContent = props.title);
		'icon' in props && setIcon(tab.querySelector('.icon'), props.icon);
	}

	remove(id) {
		this.get(id).remove();
	}

	get(id) {
		return this.tablist.querySelector(':scope>.tab[data-id="'+ id +'"]');
	}
};

function setIcon(icon, value) {
	icon.textContent = '';
	icon.style.backgroundImage = '';
	icon.classList.remove('missing');
	if (typeof value === 'string') {
		icon.style.backgroundImage = `url(${ value })`;
	} else if (typeof value.querySelector === 'function') {
		icon.appendChild(value);
	} else {
		icon.classList.add('missing');
	}
	return icon;
}

}); })(this);
