'use strict'; define('web-ext-utils/utils', function() {

const escape = string => string.replace(/[\-\[\]\{\}\(\)\*\+\?\.\,\\\^\$\|\#]/g, '\\$&');

const matchPattern = (/^(?:(\*|http|https|file|ftp):\/\/(\*|(?:\*\.)?[^\/\*]+|)\/(.*))$/);

function matchPatternToRegExp(pattern) {
	const [ , sheme, host, path, ] = matchPattern.exec(pattern);
	return new RegExp('^(?:'+
		(sheme === '*' ? '(?:https?|ftp|file|ftp)' : sheme)
		+':\/\/'+
		escape(host).replace(/\\\*/g, '[^\/]*')
		+'\/'+
		escape(path).replace(/\\\*/g, '.*')
	+')$');
}

return {
	matchPatternToRegExp,
};

});
