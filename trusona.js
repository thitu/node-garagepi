require('dotenv').load();
var trusona_settings = process.env.trusona_settings;
var ffi = require('ffi');
var trusona = ffi.Library('libtrusona', {
    'trusonafy': [ 'int', [ 'string','string' ]]
});