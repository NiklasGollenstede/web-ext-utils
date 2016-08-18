This update framework allows to easily execute update scripts at the appropriate times.
Just call it once at the application startup and your users will never loose any data to changes in the data model.

## Folder structure:
Inside the update folder, you can place the following update script files:
+ `<version>.js`  : (e.g. '1.2.34.js')
                <br>Runs once when the extension is first updated to a version >= the script name.
                <br>A version upgrade from 1.9.1 to 1.15.0 would run 1.9.5.js, 1.10.0.js and 1.15.0.js in that order.
+ `updated.js`    : Runs every time the 'version' key in the manifest.json changes to a higher version number.
+ `installed.js`  : Runs once during the extension lifetime: when the first version of the extension is installed that uses this framework.

## Update scripts:
Each .js-file in the update folder must synchronously pass a callback to the ``document.currentScript.return()`` function.
The callback is called with an object with these properties:
```
now:     {Version}  The version derived from the file name.
from:    {Version}  The version of the extension before the update started or 0.0.0 if just installed.
to:      {Version}  The version that was read from the manifest.json.
synced:  {Version}  The synced version of the extension before the update started.
                    May be higher than 'from' if the extension has been updated on a synced device already,
                    but can't be lower than 'from'.
```
To allow asynchronous work, the callback can return a Promise. The next update script will not be called while this promise is pending.
If the script doesn't export a callback as described above, it throws, the callback throws or the returned Promise rejects,
the error may be logged and the update will continue as if the script hadn't existed.
The update scripts are run in the extensions background page and have full access to the chrome[] APIs.

## Running the framework:
There are two ways to run the update framework:
### 1.) Include this file in a normal script tag and run
```JS
require('web-ext-utils/update')(options).then(result => { /* extension logic */ });
```
### 2.) Add the attribute data-run-update="true" to the script tag that includes this file.
This will run the update scripts automatically.
Options can be specified as data-&lt;name>="&lt;value>"; the result can be asynchronously required as 'web-ext-utils/update/result',
```HTML
<script src="/node_modules/web-ext-utils/update/index.js" data-run-update="true" data-history="false"></script>
```
```JavaScript
define('main', [ 'web-ext-utils/update/result', ], result => { /* extension logic */ })
```

## Options:
An object with the properties:
```
path:     {string}  Optional prefix (path) to the update scripts. Default: 'update/'.
history:  {string}  Optional granularity of the new records in the update history, a falsy value or 'false' will disable the history.
                    Values: 'days', 'minutes', 'seconds' and 'ms'. Default: 'days'.
```

## Result:
An array that contains all the Versions whose update scripts were successfully executed. With the additional properties:
```
installed:   {bool}        Optional. true iff the install script was successfully executed.
updated:     {bool}        Optional. true iff the install script was successfully executed.
history:     {[]<object>}  Optional. The update history so far, including the current update. Only present if the version number has been increased.
downgraded:  {bool}        Optional. true iff the version number decreased. No update scripts were run.
```

## History:
The history is an chronologically ordered array of { date: number, version: string, } objects.
Each object represents thee time (with options.history precision) at which the manifest.json's 'version' increased to that version.
It can be requested with ``require('web-ext-utils/update').getHistory().then(history => ...);``

## Version (numbers):
This framework expects the manifests 'version' key and the names of all update scripts to be semantic version numbers (see: http://semver.org/).
To allow correct ordering (e.g. 1.9.0 < 1.11.0) the version strings are wrapped in Version objects
which have a .toPrimitive() method which ensures correct comparison behaviour
(< and > as semantically expectable, and new Version(s1) === new Version(s2), if s1 === s2).
and can be  cast into normalised strings (same as the original string, if it was a semantic version string).

## Storage usage:
The update framework stores the last installed version of the extension in chrome.storage.local and .sync.
If chrome.storage.sync is not available, it will write everything to the .local storage.
The following keys are used:
```
   local: '__update__.local.version'
   sync:  '__update__.sync.version'
   local: '__update__.history'
```
Important: If the '__update__.local.version' key is deleted, the framework will run as if the extension was freshly installed.
           So make sure not to delete any of these storage entries and restore them if you .clear() a storage compartment.

