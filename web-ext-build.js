(function() { 'use strict'; // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

const { files, isGecko, isBlink, files: { FS, }, } = require('web-ext-build/util/');

/**
 * Generates and/or includes additional, library/framework specific files.
 * This currently:
 * * includes and renames the entry point for `views/<name>(/index)?[.](html|js)`
 * * includes a background page loading `background/index.js`
 * * generates the file of files (`file.json`)
 * * runs `readPBQ`, adjusted for some implicit dependencies
 * Configuration can be set in the extension's `package.json`, see `./web-ext-build.yaml`.
 * @param  {Context}    ctx        The build context.
 */
async function extendFs(ctx, { } = { }) {

	const srcDir = (ctx.package.config && ctx.package.config['web-ext-utils'] && ctx.package.config['web-ext-utils'].srcDir || '').replace(/[/]?$/, '/');

	{
		const viewName = (ctx.package.config && ctx.package.config['web-ext-utils'] && ctx.package.config['web-ext-utils'].viewName || ctx.package.name) + (isGecko(ctx) ? '' : '.html');
		const diskPath = ctx.rootDir +'/node_modules/web-ext-utils/loader/_view.html';
		const viewHtml = {
			parent: null, generated: true, path: null, diskPath, content: (await FS.readFile(diskPath, 'utf-8')),
		};
		ctx.files['view.html'] = { ...viewHtml, path: '/view.html', };
		ctx.files[viewName] = { ...viewHtml, path: '/'+ viewName, };
		ctx.files[viewName +'.html'] = { ...viewHtml, path: '/'+ viewName +'.html', };
		(await files.addModule(ctx, 'node_modules/web-ext-utils/loader/_view.js'));
	}

	if (files.has(ctx, srcDir +'background/index.js')) {
		const backgroundHtml =
		(await files.addModule(ctx, 'node_modules/web-ext-utils/loader/_background.html'));
		(await files.addModule(ctx, 'node_modules/web-ext-utils/loader/_background.js'));
		backgroundHtml.content = backgroundHtml.content.replace(/baseUrl="[^"]*"&/, `baseUrl="/${ srcDir.replace(/[^\w/-]+/g, '') }"&`);
	}

	ctx.files['files.json'] = {
		parent: null, generated: true, path: '/files.json',
		get content() {
			const files = { };
			(function add(from, to) {
				for (const { 0: name, 1: file, } of Object.entries(from)) { if (file) {
					if (file.children) {
						add(file.children, to[name] = { });
					} else { to[name] = true; }
				}
			} })(ctx.files, files);
			return JSON.stringify(files, null, '\t');
		},
	};

	const pbq = (await readPBQ(ctx, { srcDir, shims: {
		'node_modules/web-ext-utils/loader/content': null, // this does to many modifications to the global scope
	}, modules: [
		files.has(ctx, srcDir +'common/options.js') && !hasView(ctx, srcDir, 'options')
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
 * This assumes that all `.js` files in `srcDir` will be loaded, and allows those to recursively require
 * additional files from `node_modules/`, which will then be included in `ctx.files`.
 * Loads the `node_modules/` from the file system and requires that the `read-fs` stage ran before.
 * @param  {Context}    ctx       The build context.
 * @param  {string?}    .srcDir   Base directory for all non-generated files, except for `package.json` and `node_modules/`.
 * @param  {object?}    .shims    Object `{ [id]: exports, ... }` of modules to predefine (usually as `null`) to make sure they will _not_ be loaded.
 * @param  {[string]?}  .modules  Array of module IDs to load as additional entry points.
 */
async function readPBQ(ctx, { srcDir, shims, modules, } = { }) {
	// TODO:
	// * shims should not be executed
	srcDir = (srcDir || '').replace(/[/]?$/, '');

	(await files.addModule(ctx, 'node_modules/pbq/require.js'));

	const jsFiles = files.list(files.get(ctx, srcDir).children)
	.filter(_=>(/^(?![/]*node_modules[/]).*.js$/).test(_)).map(_=>_.slice(srcDir.length));

	const browser = new (require('pbq/node/sandbox'))({
		urlPrefix: 'extension:/'+ (srcDir ? srcDir +'/' : ''), globals: { console, },
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
		paths: { // independent of `srcDir`, these are always in the root
			'node_modules': '/node_modules',
			'package.json': '/package.json',
			'manifest.json': '/manifest.json',
			'files.json': '/files.json',
		},
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

	const srcDir = (ctx.package.config && ctx.package.config['web-ext-utils'] && ctx.package.config['web-ext-utils'].srcDir || '').replace(/[/]?$/, '/');
	const defaultIcon = { 64: `/${srcDir}icon`+ (files.has(ctx, srcDir +'icon.svg') && !isBlink(ctx) ? '.svg' : '.png'), };

	ctx.manifest = {
		icons: defaultIcon,
		background: files.has(ctx, srcDir +'background/index.js') ? {
			page: '/node_modules/web-ext-utils/loader/_background.html',
			scripts: undefined,
			persistent: true, // events after wakeup wouldn't be handled correctly yet
		} : undefined,
		options_ui: files.has(ctx, srcDir +'common/options.js') ? {
			page: '/view.html#options',
			open_in_tab: false,
			browser_style: false,
		} : undefined,
		browser_action: {
			default_title: ctx.package.title,
			default_popup: hasView(ctx, srcDir, 'panel') ? '/view.html#panel' : undefined,
			default_icon: defaultIcon,
			browser_style: false,
		},
		sidebar_action: hasView(ctx, srcDir, 'sidebar') ? {
			default_title: ctx.package.title,
			default_panel: '/view.html#sidebar',
			default_icon: defaultIcon,
			browser_style: false,
		} : undefined,
	};
}
function hasView(ctx, srcDir, name) { return files.has(ctx, `${srcDir}/views/${name}.js`, `${srcDir}/views/${name}.html`, `${srcDir}/views/${name}/index.js`, `${srcDir}/views/${name}/index.html`); }

return (module.exports = {
	'extend-fs': extendFs,
	'read-pbq': readPBQ,
	'prepare-manifest': prepareManifest,
});

})();
