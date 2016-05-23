'use strict'; define('web-ext-utils/tabview', [
], function(
) {

const styles = {
	default: `
		.content, .tablist, .tab {
			box-sizing: border-box;
		}
		.content {
			position: absolute;
			overflow: auto;
		}
		.tablist {
			position: absolute;
		}
		.tab {
			border-color: transparent;
			border-style: solid;
			border-width: 0;
			background-repeat: no-repeat;
			background-position: center left;
			transition-property: color, fill, background-color, border-color;
			transition-duration: 0.21s;
			cursor: pointer;
			-webkit-user-select: none;
			-moz-user-select: none;
		}
	`,
	vertical: `
		.content {
			top: 0px; height: 100%;
			right: 0px; width: calc(100% - 200px);
		}
		.tablist {
			top: 0px; height: 100%;
			left: 0px; width: 200px;
			padding-top: 54px;
		}
		.tab {
			height: 54px;
			line-height: 54px;
			padding-left: 54px;
			font-size: 24px;
			border-left-width: 5px;
			background-size: 48px;
		}
	`,
	horizontal: `
		.content {
			left: 0px; width: 100%;
			bottom: 0px; height: calc(100% - 40px);
		}
		.tablist {
			left: 0px; width: 100%;
			top: 0px; height: 40px;
		}
		.tab {
			float: left;
			height: 100%;
			line-height: 35px;
			padding-left: 32px;
			padding-right: 10px;
			background-position-x: 10px;
			background-size: 20px;
			border-bottom-width: 5px;
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

return class Home {
	constructor({ host, content, tabs, active, onSelect, style, }) {
		this.style = host.appendChild(document.createElement('style'));
		this.style.scoped = true;
		this.style.textContent = typeof style !== 'string' ? '' : styles.default + style.split(' ').map(style => styles[style]).join('\n');
		this.tablist = host.appendChild(document.createElement('div'));
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
		tab.dataset.id = id;
		tab.className = 'tab';
		tab.style.backgroundImage = `url(${ icon })`;
		tab.textContent = title;
		tab.data = data;
		tab.onclick = ({ button, }) => !button && (this.active = id);
	}

	set(props) {
		const tab = this.get(props.id);
		'title' in props && (tab.textContent = props.title);
	}

	remove(id) {
		this.get(id).remove();
	}

	get(id) {
		return this.tablist.querySelector('.tab[data-id="'+ id +'"]');
	}
};

});
