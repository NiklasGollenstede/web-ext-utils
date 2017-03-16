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

async function Home(window, options, name) {
	const { document, } = window;

	if (style.includes('dark')) { document.body.style.background = '#222'; }
	document.body.style.overflow = 'hidden'; // firefox -.-
	const link = document.head.appendChild(document.createElement('link'));
	link.href = require.toUrl(`../tabview/index.css`); link.rel = 'stylesheet';

	const tabView = new TabView({
		host: document.body, template: document.createElement('iframe'),
		active: name || index, tabs, style,

		async onLoad({ id, content: frame, }) { try {
			const view = frame.contentWindow, { document, } = view;
			view.background = global;
			document.documentElement.classList.add('preload');

			if (typeof head === 'string') {
				document.head.innerHTML = head;
			} else if (Array.isArray(head)) {
				head.forEach(node => document.head.appendChild(node.cloneNode(true)));
			}
			try { view.history.replaceState(window.history.state, null); } catch (_) { }

			(await (handlers[id] || handlers['404'])(view, { }, id));
			global.setTimeout(() => document.documentElement.classList.remove('preload'), 500);
		} catch (error) { reportError(`Failed to display tab "${ id }"`, error); } },

		onShow({ id, title, }) {
			id !== '404' && document.location.hash.replace(/^\#|\?.*$/g, '') !== id && (document.location.hash = id);
			document.title = title +' - '+ manifest.name;
		},
	});

	window.addEventListener('popstate', () => (tabView.active = window.location.hash.replace(/^\#|\?.*$/g, '') || index));

	window.tabs = tabView;
}

return Home;

}); })(this);
