(function(global) { 'use strict'; define(({ // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
	'./': { Runtime, Tabs, },
	'../node_modules/multiport/': Port,
}) => {

/**
 * A multiport/Port that wrapps the runtime/tabs.on/sendMessage API for more convenient message sending and receiving.
 * @see https://github.com/NiklasGollenstede/multiport/blob/master/index.js
**/

const port = new Port({ runtime: Runtime, tabs: Tabs, }, Port.web_ext_Runtime);
Object.getOwnPropertyNames(Port.prototype).forEach(key => typeof port[key] === 'function' && (port[key] = port[key].bind(port)));
return port;

}); })(this);
