(function() { 'use strict'; // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

const { files, isGecko, isBlink, files: { FS, }, } = require('web-ext-build/util/');

/**
 * Generates and/or includes additional, library/framework specific files.
 * This currently:
 * * includes and renames the entry point for `views/<name>(/index)?[.](html|js)`
 * * includes a background page loading `background/index.js`
 * * generates the file of files `file.json`
 * * runs `readPBQ`, adjusted for some implicit dependencies
 * @param  {Context}    ctx        The build context.
 * @param  {string}     .viewName  Name for the base HTML file showing all `views/`. Full URL will be `<vendor>-extension://<uuid>/<viewName>`, with an appended `.html` for non-gecko browsers.
 */
async function extendFs(ctx, { viewName, } = { }) {

	viewName || (viewName = ctx.package.name);
	!isGecko(ctx) && (viewName += '.html'); {
		const diskPath = ctx.rootDir +'/node_modules/web-ext-utils/loader/_view.html';
		const viewHtml = {
			parent: null, generated: true, path: null, diskPath, content: (await FS.readFile(diskPath, 'utf-8')),
		};
		ctx.files['view.html'] = { ...viewHtml, path: '/view.html', _linkAs: viewName, };
		ctx.files[viewName] = { ...viewHtml, path: '/'+ viewName, };
		ctx.files[viewName +'.html'] = { ...viewHtml, path: '/'+ viewName +'.html', };
		files.addModule(ctx, 'node_modules/web-ext-utils/loader/_view.js');
	}

	if (files.has(ctx, 'background/index.js')) {
		files.addModule(ctx, 'node_modules/web-ext-utils/loader/_background.html');
		files.addModule(ctx, 'node_modules/web-ext-utils/loader/_background.js');
	}

	ctx.files['files.json'] = {
		parent: null, generated: true, path: '/files.json',
		get content() {
			const files = { };
			(function add(from, to) {
				for (const { 0: name, 1: file, } of Object.entries(from)) {
					if (file.children) {
						add(file.children, to[name] = { });
					} else { to[name] = file._linkAs || true; }
				}
			})(ctx.files, files);
			return JSON.stringify(files, null, '\t');
		},
	};

	const pbq = (await readPBQ(ctx, { shims: {
		'node_modules/web-ext-utils/loader/content': null, // this does to many modifications to the global scope
	}, modules: [
		files.has(ctx, 'common/options.js') && !hasView(ctx, 'options')
		&& '/node_modules/web-ext-utils/options/editor/inline',
		'/node_modules/web-ext-utils/loader/views',
	].filter(_=>_), }));

	{ // add the predefined '.../content' module if it is needed
		const content = pbq.require.cache['node_modules/web-ext-utils/loader/content'];
		Object.values(pbq.require.cache).some(module => module.children.includes(content))
		&& (await files.addModule(ctx, 'node_modules/web-ext-utils/loader/content.js'));
	}

}

/**
 * Uses PBQ's dry-run mode to resolve and include module dependencies.
 * This assumes that all `.js` files in `src/` will be loaded, and allows those to recursively require
 * additional files from `node_modules/`, which will then be included in `ctx.files`.
 * Loads the `node_modules/` from the file system and requires that the `read-fs` stage ran before.
 * @param  {Context}    ctx       The build context.
 * @param  {object?}    .shims    Object `{ [id]: exports, ... }` of modules to predefine (usually as `null`) to make sure they will _not_ be loaded.
 * @param  {[string]?}  .modules  Array of module IDs to load as additional entry points.
 */
async function readPBQ(ctx, { shims, modules, } = { }) {
	// TODO:
	// * shims should not be executed

	(await files.addModule(ctx, 'node_modules/pbq/require.js'));

	const jsFiles = files.list(ctx.files).filter(_=>(/^(?![/]*node_modules[/]).*.js$/).test(_));

	const browser = new (require('pbq/node/sandbox'))({
		urlPrefix: 'extension:/', globals: { console, },
		async fetch(url, _type) {
			if (!url.startsWith('extension:/')) { throw new Error(`URL does not start with the correct prefix`); }
			const path = url.slice('extension:/'.length);
			if (path.startsWith('node_modules/')) {
				const file = (await files.addModule(ctx, path));
				//console.log('loaded modules file'+ path);
				return file.content;
			} else { return files.read(ctx, path); }
		},
	});
	(await new Promise((callback, errback) => browser.config({
		modules: { // modules to define without loading them
			'node_modules/pbq/require': null, // include the loader itself
			...(shims || { }),
		},
		deps: [ ...jsFiles.map(_=>_.slice(0, -3)), ...(modules || [ ]), ],
		dryRun: true, callback, errback,
	})));
	return browser;
}

/**
 * Prepares some manifest entries based on naming conventions of source files:
 * * `background/index.js` ==> `background`
 * * `common/options.js` ==> `options_ui`
 * * `views/panel(/index)?[.](html|js)` ==> `browser_action.default_popup`
 * * `views/sidebar(/index)?[.](html|js)` ==> `sidebar_action`
 * @param  {Context}  ctx  The build context.
 */
async function prepareManifest(ctx, { } = { }) {

	const defaultIcon = { 64: files.has(ctx, 'icon.svg') && !isBlink(ctx) ? '/icon.svg' : '/icon.png', };

	ctx.manifest = {
		background: files.has(ctx, 'background/index.js') ? {
			page: 'node_modules/web-ext-utils/loader/_background.html',
			scripts: undefined,
			persistent: true, // events after wakeup wouldn't be handled correctly yet
		} : undefined,
		options_ui: files.has(ctx, 'common/options.js') ? {
			page: 'view.html#options',
			open_in_tab: false,
			browser_style: false,
		} : undefined,
		browser_action: {
			default_title: ctx.package.title,
			default_popup: hasView(ctx, 'panel') ? 'view.html#panel' : undefined,
			default_icon: defaultIcon,
			browser_style: false,
		},
		sidebar_action: hasView(ctx, 'sidebar') ? {
			default_title: ctx.package.title,
			default_panel: 'view.html#sidebar',
			default_icon: defaultIcon,
			browser_style: false,
		} : undefined,
	};
}
function hasView(ctx, name) { return files.has(ctx, `views/${name}.js`, `views/${name}.html`, `views/${name}/index.js`, `views/${name}/index.html`); }

return (module.exports = {
	'extend-fs': extendFs,
	'read-pbq': readPBQ,
	'prepare-manifest': prepareManifest,
});

})();
