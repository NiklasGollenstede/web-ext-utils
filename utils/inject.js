(function(global) { 'use strict'; const factory = function webExtUtils_inject(exports) { // This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Synchronously executes a function in the page context.
 * Note: The function is executed in a completely untrusted context.
 * If the page removes/replaces any of the global values this `inject` function uses, the behavior is undefined.
 * `inject` does not necessarily notice such modifications and can not ensure that the return value is trustworthy,
 * or that `_function` was called at all.
 * Besides that, the calling overhead is considerable.
 * @param  {function}  _function  The Function to call in the page context.
 *                                Must be decompilable, and must not closure around any variables.
 *                                The global context the function is executed in is that of the page, and thus untrusted.
 *                                The `this` in the function is the pages window (untrusted).
 * @param  {...any}    args       Any number of JSONable args the function will be called with.
 * @this   {Window}               Optional. To inject into the scope of an iframe, call with that iframe as `this`.
 * @return {any}                  JSON clone of `_function`s return value.
 * @throws {EvalError}            If `_function` could not be evaluated, for example due to iframe sandboxing or the pages CSP.
 * @throws {any}                  If `_function` throws, a JSON clone of the thrown value is thrown.
 *                                If that value is `instanceof Error`, an error of a corresponding type is re-thrown.
 */
function inject(_function, ...args) {
	if (typeof _function !== 'function') { throw new TypeError('Injecting a string is a form of eval()'); }
	const { document, } = (this || global); // call with an iframe.contentWindow as this to inject into its context

	const script = document.createElement('script');
	script.dataset.args = JSON.stringify(args);
	script.dataset.source = _function +''; // get the functions source
	script.textContent = (`(`+ function (script) { try {
		const args = JSON.parse(script.dataset.args);
		const value = new Function('return ('+ script.dataset.source +').apply(this, arguments);').apply(this, args); // eslint-disable-line no-invalid-this
		script.dataset.value = JSON.stringify(value) || 'null';
		script.dataset.done = true;
	} catch (error) {
		try {
			script.dataset.error = error instanceof Error
			? '$_ERROR_$'+ JSON.stringify({ name: error.name, message: error.message, stack: error.stack, })
			: JSON.stringify(error);
		} catch (_) { throw error; }
		throw error; // will log the exception in the page context
	} } +`).call(this, document.currentScript)`);
	document.documentElement.appendChild(script).remove(); // evaluates .textContent synchronously in the page context

	if (script.dataset.error) { throw parseError(script.dataset.error); }
	if (!script.dataset.done) {
		throw new EvalError('Script was not executed at all'); // may fail due to sandboxing or CSP
	}
	return JSON.parse(script.dataset.value);
}

/**
 * Same as `inject`, only that it executes `_function` asynchronously,
 * allows `_function` to return a Promise, and that it returns a Promise to that value.
 * The calling overhead is even greater than that of the synchronous `inject`.
 * @this   {Window}
 */
function injectAsync(_function, ...args) { return new Promise((resolve, reject) => {
	if (typeof _function !== 'function') { throw new TypeError('Injecting a string is a form of eval()'); }
	const { document, } = (this || global); // call with an iframe.contentWindow as this to inject into its context

	const script = document.createElement('script');
	script.dataset.args = JSON.stringify(args);
	script.dataset.source = _function +''; // get the functions source
	script.textContent = (`(`+ function (script) {
		const args = JSON.parse(script.dataset.args);
		const _function = new Function('return ('+ script.dataset.source +').apply(this, arguments);');
		script.dataset.done = true;
		Promise.resolve().then(() => _function.apply(this, args)) // eslint-disable-line no-invalid-this
		.then(value => report('value', value))
		.catch(error => report('error', error));
		function report(type, value) {
			value = type === 'error' && (value instanceof Error)
			? '$_ERROR_$'+ JSON.stringify({ name: value.name, message: value.message, stack: value.stack, })
			: JSON.stringify(value);
			script.dispatchEvent(new this.CustomEvent(type, { detail: value, })); // eslint-disable-line no-invalid-this
		}
	} +`).call(this, document.currentScript)`);
	document.documentElement.appendChild(script).remove(); // evaluates .textContent synchronously in the page context

	if (!script.dataset.done) {
		throw new EvalError('Script was not executed at all'); // may fail due to sandboxing or CSP
	}

	function reported({ type, detail: value, }) {
		if (typeof value !== 'string') { throw new Error(`Unexpected event value type in injectAsync`); }
		switch (type) {
			case 'value': {
				resolve(JSON.parse(value));
			} break;
			case 'error': {
				reject(parseError(value));
			} break;
			default: {
				throw new Error(`Unexpected event "${ type }" in injectAsync`);
			}
		}
		script.removeEventListener('value', reported);
		script.removeEventListener('error', reported);
	}
	script.addEventListener('value', reported);
	script.addEventListener('error', reported);
}); }

function parseError(string) {
	if (!string.startsWith('$_ERROR_$')) { return JSON.parse(string); }
	const object = JSON.parse(string.slice(9));
	const error = Object.create((object.name ? global[object.name] || Error : Error).prototype);
	Object.assign(error, object);
	return error;
}

// should not reject
/*function test() { return new Promise((resolve, reject) => {
	try {
		inject((a, b) => { throw new TypeError('foo'); }, 1, 2);
		reject(1);
	} catch (error) {
		if (!(error instanceof TypeError)) { reject(2); }
		if (error.message !== 'foo') { reject(3); }
	}

	if (
		inject((a, b) => { return a + b; }, 1, 2) !== 3
	) { reject(4); }

	Promise.all([

		injectAsync((a, b) => { throw new TypeError('foo'); }, 1, 2)
		.then(() => reject(5))
		.catch(error => {
			if (!(error instanceof TypeError)) { reject(6); }
			if (error.message !== 'foo') { reject(7); }
		}),

		injectAsync((a, b) => new Promise(resolve => setTimeout(resolve, 2, a + b)), 1, 2)
		.then(value => value !== 3 && reject(8)),

	]).then(resolve, reject);
}); }*/

return {
	inject,
	injectAsync,
};

}; if (typeof define === 'function' && define.amd) { define([ 'exports', ], factory); } else { const exp = { }, result = factory(exp) || exp; if (typeof exports === 'object' && typeof module === 'object') { /* eslint-disable */ module.exports = result; /* eslint-enable */ } else { global[factory.name] = result; /* global QueryInterface */ if (typeof QueryInterface === 'function') { global.exports = result; global.EXPORTED_SYMBOLS = [ 'exports', ]; } } } })(this); // eslint-disable-line no-invalid-this
