(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../browser/version': { current, },
	'../utils/event': { setEvent, },
	'../../es6lib/dom': { createElement, },
	require,
}) => {

const Self = new WeakMap;

return class TabView {
	constructor({
		host = global.document.body, template = createElement('div'),
		tabs = [ ], active, onLoad, onShow, onHide, onUnload, style = [ ], linkStyle = true,
	}) {
		const self = { template, tabs: { }, active: null, default: null, }; Self.set(this, self);

		const root = this.root = self.root = createElement('div', {
			classList: 'tabview '+ style.map(style => style === 'browser' ? current : style).join(' '),
		}, [
			linkStyle && createElement('link', { href: require.toUrl(`./index.css`), rel: 'stylesheet', }),
			createElement('div', {
				classList: 'tabwrapper',
			}, [
				self.tablist = createElement('div', {
					classList: 'tablist',
				}),
			]),
			self.content = createElement('div', {
				classList: 'content',
			}),
		]);

		self.onLoad = onLoad && setEvent(this, 'onLoad', { init: onLoad, }) || null;
		self.onShow = onShow && setEvent(this, 'onShow', { init: onShow, }) || null;
		self.onHide = onHide && setEvent(this, 'onHide', { init: onHide, }) || null;
		self.onUnload = onUnload && setEvent(this, 'onUnload', { init: onUnload, }) || null;

		tabs.forEach(tab => this.add(tab));
		this.active = active;
		host && host.appendChild(root);
	}

	get onLoad() { Self.get(this).onLoad = setEvent(this, 'onLoad', { lazy: false, }); return this.onLoad; }
	get onShow() { Self.get(this).onShow = setEvent(this, 'onShow', { lazy: false, }); return this.onShow; }
	get onHide() { Self.get(this).onHide = setEvent(this, 'onHide', { lazy: false, }); return this.onHide; }
	get onUnload() { Self.get(this).onUnload = setEvent(this, 'onUnload', { lazy: false, }); return this.onUnload; }

	async setActive(id) { try {
		const self = Self.get(this);
		const old = self.active;
		if (old && old.id === id) { return; }
		if (self.selecting) { console.warn(`Tabview: ignoring recursive setActive() call`); return; } self.selecting = true;
		const now = self.active = self.tabs[id] || self.default || null;
		old && old.tile.classList.remove('active');
		now && now.tile.classList.add('active');

		if (old) {
			self.onHide && (await self.onHide([ old.arg, ]));
			if (old.unload) {
				self.onUnload && (await self.onUnload([ old.arg, ]));
				old.content.remove();
				old.content = null;
			} else {
				old.content.classList.remove('active');
			}
		}

		if (!now) { return; }
		if (!now.content) {
			now.content = self.template.cloneNode(true);
			now.content.classList.add('active');
			const wait = now.content.tagName === 'IFRAME' && new Promise(loaded => (now.content.onload = _=>loaded(_.target)));
			self.content.appendChild(now.content);
			wait && (await wait); wait && (now.onload = null);
			self.onLoad && (await self.onLoad([ now.arg, ]));
		} else {
			now.content.classList.add('active');
		}
		self.onShow && (await self.onShow([ now.arg, ]));

	} finally { Self.get(this).selecting = false; } }

	set active(id) { this.setActive(id); }
	get active() {
		const self = Self.get(this);
		return self.active && self.active.id;
	}

	add({ id, position = Infinity, }) {
		const self = Self.get(this);
		if (self.tabs[id]) { throw new Error(`Duplicate tab id "${ id }"`); }
		const tab = self.tabs[id] = {
			id, tile: null, content: null, data: { }, title: '',
			default: false, unload: false,
			arg: Object.freeze({
				id,
				get data() { return tab.data; },
				get content() { return tab.content; },
				get title() { return tab.title; },
			}),
		};
		tab.tile = self.tablist.insertBefore(createElement('div', {
			classList: 'tab',
			onclick: ({ button, }) => !button && (this.active = id),
		}, [
			tab.titleElement = createElement('span', { classList: 'title', }),
			tab.iconElement = createElement('div', { classList: 'icon', }),
		]), self.tablist.children[position]);
		this.set(arguments[0]);
	}

	set(props) {
		const self = Self.get(this);
		const tab = self.tabs[props.id];
		if (!tab) { throw new Error(`No such tab "${ props.id }"`); }
		'title' in props && (tab.titleElement.textContent = tab.title = props.title);
		'icon' in props && setIcon(tab.iconElement, props.icon);
		'hidden' in props && tab.tile.classList[props.hidden ? 'add' : 'remove']('hidden-tab');
		'default' in props && (self.default = tab);
		'data' in props && (tab.data = props.data !== undefined ? props.data : { });
		'unload' in props && (tab.unload = props.unload);
	}

	async remove(id) {
		const self = Self.get(this);
		const tab = self.tabs[id];
		if (!tab) { return; }
		const wait = tab === self.active && this.setActive();
		tab.tile.remove(); delete self.tabs[id]; wait && (await wait);
		if (tab.content && tab.content.parentNode) {
			self.onUnload && (await self.onUnload([ tab.arg, ]));
			tab.content.remove();
			tab.content = null;
		}
	}

	get(id) {
		const self = Self.get(this);
		return self.tabs[id] && self.tabs[id].arg;
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
