/*	Measures every font in ctrl/tdfonts and records the ones that can set the
	splash's four words -- NERD, NEWS, DEV, LOG -- at a height that leaves room
	to stack two of them and still hang a lower third underneath.

		jsexec -c /sbbs/ctrl /sbbs/xtrn/dev-log/buildcache.js

	Run it at install, and again if you change the words or the terminal sizes
	you care about.  The door does not call this: it reads the cache, and if the
	cache is missing it samples a few fonts and saves what worked, which keeps a
	fresh install usable but leaves the full list to be measured here, once,
	rather than on someone's logon. */

load("sbbsdefs.js");

var splash = load({}, js.exec_dir + "splash.js");

/*	The sizes worth measuring.  80x24 is the overwhelming majority of callers;
	the rest are here so a wide or a tall terminal still gets a splash instead of
	a blank pause. */
var SIZES = [
	[80, 24],
	[80, 25],
	[132, 24],
	[132, 43]
];

for (var i = 0; i < SIZES.length; i++) {
	var w = SIZES[i][0];
	var h = SIZES[i][1];
	var t = time();
	var fit = splash.buildCache(w, h);
	writeln(w + "x" + h + ": " + fit.length + " fonts fit (" + (time() - t) + "s)");
}

writeln("cache written to " + js.exec_dir + "tdfcache.ini");
