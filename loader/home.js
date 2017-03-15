(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'node_modules/web-ext-utils/tabview/': TabView,
	'node_modules/web-ext-utils/browser/': { manifest, },
	'node_modules/web-ext-utils/utils/': { reportError, },
	require,
}) => function Home({
	tabs = [ ],
	index = 'options',
	style = [ 'vertical', ],
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

	const tabView = new TabView({
		host: document.body,
		content: document.createElement('div'),
		active: name || index,
		style,
		tabs,

		async onSelect({ data, textContent: title, }, id) { try {
			for (const frame of this.content.children) { frame.style.display = 'none'; }
			let frame = data.frame;
			if (!handlers[id] || id === '404') { frame && frame.remove(); frame = null; } // always reload error handler
			if (!frame) {
				frame = data.frame = (await new Promise(loaded => {
					const frame = window.document.createElement('iframe');
					frame.dataset.id = id;
					Object.assign(frame.style, { border: 'none', width: '100%', height: 'calc(100% - 5px)', });
					frame.onload = _=>loaded(_.target);
					this.content.appendChild(frame);
				}));

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
			}
			frame.style.display = '';
			document.location.hash.replace(/^\#|\?.*$/g, '') !== id && (document.location.hash = id);
			document.title = title +' - '+ manifest.name;
		} catch (error) { reportError(`Failed to display tab "${ id }"`, error); } },
	});
	window.addEventListener('popstate', () => (tabView.active = window.location.hash.replace(/^\#|\?.*$/g, '')));

}

return Home;

}); })(this);
