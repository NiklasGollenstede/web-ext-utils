(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'../tabview/': TabView,
	'../browser/': { manifest, },
	'../utils/': { reportError, },
	require,
}) => function Home({
	tabs = [ ],
	index = 'options',
	style = [ 'vertical browser', ],
	head = [ ],
}) {

const handlers = { };

require([ 'node_modules/web-ext-utils/loader/views', ], ({ getHandler, setHandler, }) => {
	setHandler('', Home);
	tabs.forEach(tab => (handlers[tab.id] = getHandler(tab.id)) === setHandler(tab.id, Home));
});

async function Home(window, location) {
	const { document, } = window;

	if (style.includes('dark')) { document.body.style.background = '#222'; }
	document.body.style.overflow = 'hidden'; // firefox -.-
	const link = document.head.appendChild(document.createElement('link'));
	link.href = require.toUrl(`../tabview/index.css`); link.rel = 'stylesheet';

	const tabView = new TabView({
		host: document.body, template: document.createElement('iframe'),
		active: location.name || index, tabs, style,

		async onLoad({ id, content: frame, }) { try {
			const view = frame.contentWindow, { document, } = view;
			view.background = global;
			document.documentElement.classList.add('preload');

			Array.isArray(head) && head.forEach(node => document.head.appendChild(node.cloneNode(true)));
			try { view.history.replaceState(window.history.state, null); } catch (_) { }

			(await (handlers[id] || handlers['404'])(view, location));
			global.setTimeout(() => document.documentElement.classList.remove('preload'), 500);
		} catch (error) { reportError(`Failed to display tab "${ id }"`, error); } },

		onShow({ id, title, }) {
			id !== '404' && (location.name = id);
			document.title = title +' – '+ manifest.name;
		},
	});

	location.onNameChange(name => (tabView.active = name || index));

	window.tabs = tabView;
}

return Home;

}); })(this);
