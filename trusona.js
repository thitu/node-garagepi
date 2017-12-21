require('dotenv').load();
var ffi = require('ffi');
var trusona = ffi.Library('libtrusona', {
    'trusonafy': [ 'int', [ 'string','string' ]]
});