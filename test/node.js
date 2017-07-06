/*eslint strict: ["error", "global"], no-implicit-globals: "off"*/ 'use strict'; /* globals global, require, */ // license: MPL-2.0

const chai = require('chai');
chai.should();

global.expect = chai.expect;
global.AssertionError = chai.AssertionError;
global.Assertion = chai.Assertion;
global.assert = chai.assert;
