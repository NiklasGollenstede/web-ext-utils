(function() { 'use strict'; /* globals require, module, */ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

const { files: Files, isGecko, isBlink, files: { FS, }, } = require('web-ext-build/util/index');

/**
 * Generates and/or includes additional, library/framework specific files.
 * This currently:
 * * includes and renames the entry point for `views/<name>(/index)?[.](html|js)`
 * * includes a background page loading `background/index(.esm)?.js`
 * * generates the file of files (`file.json`)
 * * sets `importMap` paths for itself and the libraries it uses
 * Configuration can be set in the extension's `package.json`, see `./web-ext-build.yaml`.
 * @param  {import('web-ext-build/util/types').Context}    ctx        The build context.
 */
async function extendFs(ctx, { } = { }) {

	const srcDir = (ctx.package.config?.['web-ext-utils']?.srcDir || '').replace(/[/]?$/, '/');

	{
		const viewName = (ctx.package.config?.['web-ext-utils']?.viewName || ctx.package.name) + (isGecko(ctx) ? '' : '.html');
		const diskPath = ctx.rootDir +'/node_modules/web-ext-utils/loader/_view.html';
		const viewHtml = {
			parent: null, generated: /**@type{true}*/(true), path: null, diskPath, content: (await FS.readFile(diskPath, 'utf-8')),
		};
		ctx.files['view.html'] = { ...viewHtml, path: 'view.html', };
		ctx.files[viewName] = { ...viewHtml, path: viewName, };
		ctx.files[viewName +'.html'] = { ...viewHtml, path: viewName +'.html', };
		(await Files.addModule(ctx, 'node_modules/web-ext-utils/loader/_view.js'));
	}

	(await Files.addModule(ctx, 'node_modules/pbq/require.js'));

	ctx.importMap.imports = {
		...ctx.importMap.imports,
		'@/': srcDir.replace(/^[/]?/, '/'),
		'node_modules/':  '/node_modules/',
		'multiport/':     '/node_modules/multiport/',
		'multiport':      '/node_modules/multiport/index.esm.js',
		'pbq/':           '/node_modules/pbq/',
		'web-ext-build/': '/node_modules/web-ext-build/',
		'web-ext-event/': '/node_modules/web-ext-event/',
		'web-ext-event':  '/node_modules/web-ext-event/index.esm.js',
		'web-ext-utils/': '/node_modules/web-ext-utils/',
	};

	if (Files.has(ctx, srcDir +'background/index.js', srcDir +'background/index.esm.js')) {
		const isModule = Files.has(ctx, srcDir +'background/index.esm.js');
		const backgroundHtml =
		(await Files.addModule(ctx, 'node_modules/web-ext-utils/loader/_background.html'));
		(await Files.addModule(ctx, 'node_modules/web-ext-utils/loader/_background.js'));
		//(await Files.addModule(ctx, 'node_modules/web-ext-utils/loader/import-map.json'));
		backgroundHtml.content = /**@type{string}*/(backgroundHtml.content)
		.replace(/baseUrl="[^"]*"&/, `baseUrl="/${ srcDir.replace(/[^\w/-]+/g, '') }"&`)
		.replace(/ data-main='[^']*' /, ` data-main='"${ isModule ? 'module!' : '' }background/"' `);
		// could also insert the content of `ctx.importMap` here
	}

	ctx.files['files.json'] = {
		parent: null, generated: true, path: 'files.json',
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
}

/**
 * Prepares some manifest entries based on naming conventions of source files:
 * * `background/index.js` ==> `background`
 * * `common/options.js` ==> `options_ui`
 * * `views/panel(/index)?[.](html|js)` ==> `browser_action.default_popup`
 * * `views/sidebar(/index)?[.](html|js)` ==> `sidebar_action`
 * @param  {import('web-ext-build/util/types').Context}  ctx  The build context.
 */
async function prepareManifest(ctx, { } = { }) {

	const srcDir = (ctx.package.config?.['web-ext-utils']?.srcDir || '').replace(/[/]?$/, '/');
	const defaultIcon = { 64: `/${srcDir}icon`+ (Files.has(ctx, srcDir +'icon.svg') && !isBlink(ctx) ? '.svg' : '.png'), };

	ctx.manifest = {
		icons: defaultIcon,
		background: Files.has(ctx, srcDir +'background/index.js', srcDir +'background/index.esm.js') ? {
			page: '/node_modules/web-ext-utils/loader/_background.html',
			scripts: undefined,
			persistent: true, // events after wakeup wouldn't be handled correctly yet
		} : undefined,
		options_ui: Files.has(ctx, srcDir +'common/options.js', srcDir +'common/options.esm.js') ? {
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
function hasView(ctx, srcDir, name) { return Files.has(ctx, `${srcDir}/views/${name}.esm.js`, `${srcDir}/views/${name}.js`, `${srcDir}/views/${name}.html`, `${srcDir}/views/${name}/index.esm.js`, `${srcDir}/views/${name}/index.js`, `${srcDir}/views/${name}/index.html`); }

return (module.exports = {
	'extend-fs': extendFs,
	'prepare-manifest': prepareManifest,
});

})();
