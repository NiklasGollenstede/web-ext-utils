'use strict'; define('web-ext-utils/tabview', [
], function(
) {

const styles = {
	default: `
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
	vertical: `
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
			position: relative;
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
	horizontal: `
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
	firefox: `
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
		this.style = host.appendChild(document.createElement('style'));
		this.style.scoped = true;
		this.style.textContent = typeof style !== 'string' ? '' : styles.default + style.split(' ').map(style => styles[style]).join('\n');
		this.tabwrapper = host.appendChild(document.createElement('div'));
		this.tabwrapper.classList = 'tabwrapper';
		this.tablist = this.tabwrapper.appendChild(document.createElement('div'));
		this.tablist.classList = 'tablist';
		this.content = host.appendChild(content);
		this.content.classList = 'content';
		tabs.forEach(tab => this.add(tab));
		this.onSelect = onSelect;
		this.active = active;
	}

	set active(id) {
		const old = this.tablist.querySelector('.active');
		old && old.classList.remove('active');
		const now = this.get(id);
		now.classList.add('active');
		try { this.onSelect && this.onSelect(now); } catch (error) { console.error(error); }
	}
	get active() {
		return this.tablist.querySelector('.active').id;
	}

	add({ id, title, icon, position = Infinity, data, }) {
		const tab = this.tablist.insertBefore(document.createElement('div'), this.tablist.children[position]);
		tab.className = 'tab';
		tab.id = tab.dataset.id = id;
		tab.icon = tab.appendChild(document.createElement('div'));
		tab.icon.classList = 'icon';
		setIcon(tab, icon);
		tab._title = tab.appendChild(document.createElement('span'));
		tab._title.classList = 'title';
		tab._title.textContent = title;
		tab.data = data;
		tab.onclick = ({ button, }) => !button && (this.active = id);
	}

	set(props) {
		const tab = this.get(props.id);
		'title' in props && (tab._title.textContent = props.title);
		'icon' in props && setIcon(tab, props.icon);
	}

	remove(id) {
		this.get(id).remove();
	}

	get(id) {
		return this.tablist.querySelector('.tab[data-id="'+ id +'"]');
	}
};

function setIcon(tab, icon) {
	tab.icon.textContent = '';
	tab.icon.style.backgroundImage = '';
	tab.icon.classList.remove('missing');
	if (typeof icon === 'string') {
		tab.icon.style.backgroundImage = `url(${ icon })`;
	} else if (icon instanceof Element) {
		tab.icon.appendChild(icon);
	} else {
		tab.icon.classList.add('missing');
	}
}

});
