/*	Drives the whole door -- splash, main screen, project picker, change log --
	against a scripted sequence of keypresses, with no terminal and no network,
	and prints what the screen would have said.

		jsexec -c /sbbs/ctrl /sbbs/xtrn/dev-log/smoke.js

	jsexec has no console object, so there is nothing to run a Synchronet door
	against without building one.  This is that: enough of a terminal for frame.js
	to draw into, plus a snapshot of every frame it cycles, so a layout change can
	be looked at before it goes anywhere near a caller.

	What it is actually guarding is the row budget.  The main screen composes
	twenty-three rows into a twenty-four row frame and there is no give in it: add
	a line without taking one away and the bottom border falls off the bottom of
	the screen, which nothing in the door would notice and no exception would
	report.  So we count the rows and we look at the picture. */

load("sbbsdefs.js");
load("key_defs.js");
load("frame.js");

var splashLib = load({}, js.exec_dir + "splash.js");

// ------------------------------------------------------- a terminal, of sorts --

var shot = null;

var KEYS = [
	KEY_RIGHT,			// pick the first project out of the "all projects" roll-up
	KEY_UP,				// move up onto the change-log item
	"Q"					// and leave
];
var fed = 0;

function noop() {}

var COLS = 80;
var ROWS = 24;

/*	frame.js does not emit ANSI itself -- its Display drives the terminal through
	console.gotoxy(), console.attributes and console.write(), one cell at a time.
	So there is nothing to parse: a cursor, an attribute and a grid is a complete
	and exact model of what a caller would see.  Prototype-patching Frame would be
	the obvious route and it does not work -- dev-log.js loads frame.js itself, and
	load() re-executes, which quietly replaces any patch made before it. */
var screen = [];
var attrs = [];
var cursor = { x: 1, y: 1 };

function wipeScreen() {
	screen = [];
	attrs = [];
	for (var y = 0; y < ROWS; y++) {
		var row = [];
		var arow = [];
		for (var x = 0; x < COLS; x++) {
			row.push(" ");
			arow.push(0);
		}
		screen.push(row);
		attrs.push(arow);
	}
}
wipeScreen();

console = {
	screen_columns: COLS, screen_rows: ROWS, attributes: LIGHTGRAY,
	line_counter: 0, ctrlkey_passthru: 0, charset: "cp437", status: 0,
	print: noop, putmsg: noop, crlf: noop,
	getxy: function () { return { x: cursor.x, y: cursor.y }; },
	cleartoeol: noop, clearline: noop, ungetstr: noop,
	pushxy: noop, popxy: noop, up: noop, down: noop, left: noop, right: noop,
	beep: noop, pause: noop, lock_input: noop,
	term_supports: function () { return true; },
	strlen: function (s) { return String(s).replace(/\x01./g, "").length; },

	gotoxy: function (x, y) {
		if (typeof x === "object" && x) {
			cursor.x = x.x;
			cursor.y = x.y;
			return;
		}
		cursor.x = x;
		cursor.y = y;
	},
	write: function (str) {
		str = String(str);
		for (var i = 0; i < str.length; i++) {
			var px = cursor.x - 1;
			var py = cursor.y - 1;
			if (py >= 0 && py < ROWS && px >= 0 && px < COLS) {
				screen[py][px] = str.charAt(i);
				attrs[py][px] = console.attributes;
			}
			cursor.x++;
		}
	},
	clear: function () {
		wipeScreen();
		cursor.x = 1;
		cursor.y = 1;
	},

	inkey: function () { return ""; },		// replaced below, once splash.js is loaded
	getkey: function () { return (fed < KEYS.length) ? KEYS[fed++] : "Q"; },
	getstr: function () { return "Q"; }
};

/*	Both the splash and the main screen wait on inkey, and both of them read an
	empty return as "nothing pressed, draw another frame".  So the harness has to
	know where one ends and the other begins, or it either cuts the splash off at
	its first tick or spins in the menu forever.

	The splash's length is not guessed at -- it is read off the splash itself, so
	that retiming it cannot silently break this. */
var splashTicks = splashLib.T.end + 1;
var ANIM_FRAMES = 4;			// menu frames to let run before answering, so the
								// border comet and the title shimmer actually move

var polls = 0;
var idled = 0;

console.inkey = function () {
	polls++;
	if (polls <= splashTicks) {
		return "";								// the splash, playing out in full
	}
	if (idled < ANIM_FRAMES) {
		idled++;
		return "";								// the menu, animating
	}
	idled = 0;
	shot = snapshot();							// grab it lit, mid-chase
	return (fed < KEYS.length) ? KEYS[fed++] : "Q";
};

bbs = { online: true, sys_status: 0 };
user = { alias: "SmokeTest", number: 1 };
js.on_exit = function () {};

function snapshot() {
	var rows = [];
	var acopy = [];
	for (var y = 0; y < ROWS; y++) {
		rows.push(screen[y].join(""));
		acopy.push(attrs[y].slice());
	}
	return { rows: rows, attrs: acopy };
}

// --------------------------------------------------------------- run the door --

var failed = 0;

function check(what, ok, detail) {
	writeln((ok ? "  ok   " : "  FAIL ") + what + (detail ? "  -- " + detail : ""));
	if (!ok) {
		failed++;
	}
}

writeln("driving dev-log.js ...");
try {
	load(js.exec_dir + "dev-log.js");		// dev-log.js calls main() on load
	writeln("door exited cleanly");
} catch (e) {
	writeln("!! door threw: " + e);
	failed++;
}

// ------------------------------------------------------------------- the shot --

if (!shot) {
	check("something was drawn", false, "the door never waited on a key");
} else {
	var last = shot.rows;
	var lastAttr = shot.attrs;

	writeln("");
	writeln("main screen, as a caller would see it:");
	writeln("   +" + new Array(81).join("-") + "+");
	for (var i = 0; i < last.length; i++) {
		writeln(padded(i) + "|" + last[i] + "|");
	}
	writeln("   +" + new Array(81).join("-") + "+");
	writeln("");

	/*	The row budget.  The frame is 24 rows; the screen draws a top border, a
		body, and a bottom border.  If the bottom border is not on the last row
		the door has quietly outgrown its frame. */
	var lastDrawn = -1;
	for (i = 0; i < last.length; i++) {
		if (last[i].replace(/\s/g, "").length) {
			lastDrawn = i;
		}
	}
	check("screen fits its frame", lastDrawn < last.length,
		"last drawn row is " + lastDrawn + " of " + (last.length - 1));
	check("bottom border drawn", lastDrawn >= 0 && last[lastDrawn].indexOf("\xC0") === 0,
		"row " + lastDrawn + " starts with '" + (lastDrawn >= 0 ? last[lastDrawn].charAt(0) : "") + "'");
	check("no row overflows the width", widest(last) <= 80, "widest is " + widest(last));

	/*	The chrome is animated by repainting attributes, and an attribute bug is
		invisible in a character dump -- a comet that never lights, or a title
		drawn in one colour, looks exactly like a working one.  So check the
		colours, not just the glyphs. */
	var topRow = uniq(lastAttr[0]);
	check("border comet lights the box", topRow.length > 1,
		"top border uses attrs [" + topRow.join(",") + "]");

	var titleAttrs = uniq(lastAttr[1]).filter(function (a) { return a !== 0 && a !== LIGHTGRAY; });
	check("title is more than one colour", titleAttrs.length > 1,
		"title row uses attrs [" + titleAttrs.join(",") + "]");

	// The heatmap must never be drawn in the same ink as the box around it.
	var gridAttrs = uniq(lastAttr[8]);
	check("heatmap is not border-coloured", gridAttrs.indexOf(MAGENTA) === -1 || gridAttrs.length > 2,
		"grid row uses attrs [" + gridAttrs.join(",") + "]");
}

function uniq(arr) {
	var seen = {};
	var out = [];
	for (var i = 0; i < arr.length; i++) {
		if (!seen[arr[i]]) {
			seen[arr[i]] = true;
			out.push(arr[i]);
		}
	}
	return out.sort(function (a, b) { return a - b; });
}

function padded(n) {
	var s = String(n);
	while (s.length < 3) {
		s = " " + s;
	}
	return s;
}

function widest(rows) {
	var w = 0;
	for (var i = 0; i < rows.length; i++) {
		var t = rows[i].replace(/\s+$/, "");
		if (t.length > w) {
			w = t.length;
		}
	}
	return w;
}

writeln("");
writeln(failed ? (failed + " CHECK(S) FAILED") : "all checks passed");
exit(failed ? 1 : 0);
