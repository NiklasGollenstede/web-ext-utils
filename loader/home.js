(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../tabview/': TabView,
	'module!../browser/': { manifest, },
	'../utils/': { reportError, },
	'fetch!../tabview/index.css:css': css,
	require,
}) => function Home({
	tabs = [ ],
	index = 'options',
	style = [ 'vertical browser', ],
	head = [ ],
}) { /* globals setTimeout, */

const handlers = { };

require([ 'node_modules/web-ext-utils/loader/views', ], ({ getHandler, setHandler, }) => {
	setHandler('', Home);
	tabs.forEach(tab => { handlers[tab.id] = getHandler(tab.id); setHandler(tab.id, Home); });
});

async function Home(window, location) {

	// child view
	if (window.top !== window) { const id = location.name; try {
		const view = window, { document, } = view;
		view.background = global;
		document.documentElement.classList.add('preload');

		Array.isArray(head) && head.forEach(node => document.head.appendChild(node.cloneNode(true)));
		try { view.history.replaceState(window.history.state, null); } catch (_) { }

		(await (handlers[id] || handlers['404'])(view, location));
		updateHash(document, location.hash);
		global.setTimeout(() => document.documentElement.classList.remove('preload'), 500);
	} catch (error) { reportError(`Failed to display tab "${ id }"`, error); } return; }

	// main window
	const { document, } = window;

	if (style.includes('dark')) { document.body.style.background = '#222'; }
	document.body.style.overflow = 'hidden'; // firefox -.-
	document.head.appendChild(document.createElement('style')).textContent = css;

	const tabView = new TabView({
		host: document.body, template: document.createElement('iframe'),
		active: location.name || index, tabs, style, linkStyle: false,

		async onLoad({ id, content: frame, }) {
			id !== '404' && location.name !== id && (location.name = id);
			frame.contentWindow.location = window.location;
		},

		onShow({ id, title, content: frame, }) {
			id !== '404' && location.name !== id && (location.name = id);
			document.title = title +' – '+ manifest.name;
			setTimeout(() => updateHash(frame.contentWindow.document, location.hash), 50);
		},
	});

	location.onNameChange(name => (tabView.active = name || index));
	location.onHashChange(id => { const tab = tabView.get(tabView.active); tab && updateHash(tab.content.contentWindow.document, id); });

	function updateHash(document, id) {
		const target = id ? document.getElementById(id) : null;
		target && target.scrollIntoView();
		document.querySelectorAll('.-pseudo-target').forEach(node => node !== target && node.classList.remove('-pseudo-target'));
		target && target.classList.add('-pseudo-target');
	}

	window.tabs = tabView;
}

return Home;

}); })(this); // eslint-disable-line no-invalid-this
