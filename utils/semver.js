(function(global) { 'use strict'; const factory = function webExtUtils_semver(exports) { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

/// normalized representation of semantic version strings, can be sorted numerically
class Version {
	constructor(input) {
		if (!input) { return invalid; }
		let other; input += '';
		if ((other = versions[input])) { return other; }
		const array = (/^\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:([A-Za-z_.-]+)(\d*))?/).exec(input);
		if (!array) { return invalid; }
		const major = this.major = +array[1];
		const minor = this.minor = +array[2] || 0;
		const patch = this.patch = +array[3] || 0;
		const channel = this.channel = array[4] ? array[4][0].toLowerCase().replace(/-|_/, '.') : '';
		const build = this.build = array[4] && +array[5] || 0;
		const number = this.number = (major * 0x1000000000) + (minor * 0x1000000) + (patch * 0x10000) + (channel === '.' ? 37 : (parseInt(channel, 36) || 36) * 0x400) + (build * 0x1);
		if ((other = versions[number])) { return other; }
		this.string = `${ major }.${ minor }.${ patch }${ channel }${ build || (channel === '.' ? 0 : '') }`;
		return (versions[number] = (versions[input] = /**@type{Version}*/(/**@type{any}*/(Object.freeze(this)))));
	}
	[Symbol.toPrimitive](type) {
		return Object.hasOwnProperty.call(this, type) ? this[type] : this.string;
	}
	static create(s) { return new Version(s); }
}

const versions = { }, invalid = Version.invalid = /**@type{Version}*/(/**@type{any}*/(Object.freeze({ __proto__: Version.prototype, number: -1, string: '<invalid>', })));

return Object.freeze(Version);

}; if (typeof define === 'function' && define.amd) { define([ 'exports', ], factory); } else { const exp = { }, result = factory(exp) || exp; if (typeof exports === 'object' && typeof module === 'object') { /* eslint-disable */ module.exports = result; /* eslint-enable */ } else { global[factory.name] = result; } } })(this); // eslint-disable-line no-invalid-this
