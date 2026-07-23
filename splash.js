/*	The dev-log title, as a two-phase news open, in a different TheDraw font
	every time.

	The problem this is solving is not decoration.  Dev-log opens on a heatmap of
	coloured squares and a column of commit subjects, and to anyone who does not
	write software for a living that is a wall of nothing: the squares have no
	units and the subjects are somebody else's shorthand.  The splash is the one
	moment we have the screen to ourselves, so it spends it saying what the door
	is -- a news bulletin about what got built here -- and then hands over to a
	screen that has been relabelled to keep that promise.

	Two phases, one font.  First NERD / NEWS wipes on, which is the joke and the
	frame.  Then it flashes, a bar wipes it away, and DEV flies in from the left
	and LOG from the right to land stacked in its place, which is the door's
	actual name.  The same font carries both, so it reads as one identity putting
	its real title on rather than as two unrelated screens.

	Every font in ctrl/tdfonts is a colour font -- the artist chose the colours
	cell by cell -- so we never recolour the glyphs.  We light them: reveals,
	glints and flashes all work on the attribute byte and leave the character
	alone.

	Of the 1071 fonts, 668 can set all four words inside 80 columns at a height
	that leaves room to stack two of them.  Finding that out means loading all
	1071, which takes a few seconds -- far too long to spend on someone who just
	wanted to read the dev log.  So the list is measured once and cached next to
	the door (buildcache.js does it deliberately; if the cache is missing we
	sample a few fonts at random and save what worked, spreading the cost over a
	few visits instead of landing it all on one unlucky user).

	Kept to plain ASCII on purpose: Synchronet strings are bytes, so a UTF-8
	literal here would be indexed a byte at a time.  CP437 glyphs go in as \x escapes. */

load("sbbsdefs.js");
load("frame.js");

var tdf = load({}, "tdfonts_lib.js");

/*	tdfonts_lib never declares opt, and loadfont() reads opt.index inside a try
	whose catch calls exit(1).  Leave it undefined and the door dies where it
	stands, without a word in the log. */
if (!tdf.opt)
	tdf.opt = {};

var CACHE = "tdfcache.ini";

var PHASE1 = ["NERD", "NEWS"];
var PHASE2 = ["DEV", "LOG"];

var TAGLINE = "the story of what got built around here";

/*	A font has to set all four words, so the cache is keyed on the set below and
	not on any one of them.  Change these and the cache is stale -- bump CACHE_KEY. */
var CACHE_KEY = "nerdnews";

var MIN_HEIGHT = 5;			// under this the logo reads as a caption, not a title
var MAX_HEIGHT = 9;			// 2h + gap has to clear the stage; see stageFor()
var GAP = 1;				// blank rows between the stacked words
var LOWER_ROWS = 4;			// the gap, the rule, the tagline, the dateline
var SAMPLE = 60;			// fonts to try when there is no cache to read

var TICK_MS = 25;

/*	How long the finished card -- logo, tagline, dateline -- sits on screen doing
	nothing at all before the door moves on.

	This is the most important number in the file, and it wants to be far larger
	than instinct says.  The instinct is that a splash is an obstacle and every
	millisecond of it is a millisecond stolen, so you trim it until it is over
	almost before it began.  But that reasoning only holds for a splash that is
	pure ornament.  This one carries two lines of small text that say what the
	door actually is, and text is not ornament: it is either read or it is not
	drawn, and there is nothing in between.  A line that flashes past unread has
	cost the reader time and told them nothing, which is the worst of both.

	"They can press a key to skip it" is not an argument for going faster, either.
	Nobody dismisses a screen that is already gone.  The skip is there for the
	regular who has read it fifty times, and the only way it gets used is if the
	screen stays up long enough for a person to decide they are done with it. */
var READ_MS = 4000;

/*	The beats, in ticks, as offsets from the start.  They overlap on purpose:
	the new logo is already flying in while the bar is still wiping the old one
	away, which is what makes it read as one continuous transition rather than
	as a clear followed by an unrelated entrance.

	The second half runs slower than the first, and deliberately.  Phase one is
	four huge letters and a bar, and the eye takes all of that in at a glance --
	it can afford to move.  Phase two lands a logo and then hangs small text
	underneath it, and small text is not glanceable; it has to be read, at
	reading speed, by somebody who was not expecting to have to. */
var T = {
	wipeIn: 0, wipeInLen: 12,		// the bar reveals NERD / NEWS behind it
	glint1: 12, glint1Len: 10,		// light runs across the title
	flash: 26, flashLen: 3,			// blow it out to white
	wipeOut: 29, wipeOutLen: 10,	// bar sweeps back, taking the title with it
	fly: 33, flyLen: 16,			// DEV and LOG come in under the bar
	impact: 48, impactLen: 5,		// they land; the rule fires out of the seam
	lower: 54, lowerLen: 26,		// tagline and dateline wipe in, at reading pace
	glint2: 58, glint2Len: 14,		// and the light runs across the new title
	settled: 80						// last tick on which anything moves
};

/*	Derived, not typed in, so that changing how long the card is held is a matter
	of changing how long the card is held -- and not of re-deriving a tick count
	that silently means something else the next time a beat gets longer. */
T.end = T.settled + Math.ceil(READ_MS / TICK_MS);

var BAR_W = 3;				// solid core of the wipe bar
var BAR_TAIL = 3;			// shaded columns dragging behind it

/*	CP437: light, medium and dark shade, and the solid block.  The bar is built
	from these so it has an edge and a falloff rather than being a slab. */
var SHADE = ["\xB0", "\xB1", "\xB2"];
var SOLID = "\xDB";
var RULE = "\xDC";			// lower half block: the news bar under the logo

var BLANK_ATTR = LIGHTGRAY;	// setData ignores attr 0, so "empty" is grey-on-black

var MONTHS = ["January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December"];
var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clamp(v, lo, hi) {
	if (v < lo) return lo;
	if (v > hi) return hi;
	return v;
}

/*	Fast out of the gate, hard deceleration into the stop.  A linear slide reads
	as a scroll; this reads as something thrown. */
function easeOut(p) {
	var inv = 1 - p;
	return 1 - (inv * inv * inv);
}

/*	Walk the glyph cells rather than rendering the font to a string.  A string
	gives us rows of text; this gives every cell its own coordinates and its own
	colour, which is what makes a wipe, a glint and a fly-in possible at all --
	each of them is a pass over cell positions or cell attributes. */
function wordCells(word, font) {
	var cells = [];
	var x = 0;

	for (var c = 0; c < word.length; c++) {
		var g = font.glyphs[tdf.lookupchar(word.charAt(c), font)];
		if (!g) {
			x += font.spacing;
			continue;
		}
		for (var gy = 0; gy < g.height; gy++) {
			for (var gx = 0; gx < g.width; gx++) {
				var cell = g.cell[gy * g.width + gx];
				if (!cell || !cell.utfchar || cell.utfchar == " ")
					continue;
				cells.push({
					x: x + gx,
					y: gy,
					ch: cell.utfchar,
					attr: cell.color & ~BLINK		// a blinking logo helps nobody
				});
			}
		}
		x += g.width + font.spacing;
	}

	var width = 0;
	for (var i = 0; i < cells.length; i++) {
		if (cells[i].x + 1 > width)
			width = cells[i].x + 1;
	}

	return { cells: cells, width: width, height: font.height };
}

/*	Does this font set all four words at a size we can stack two of? */
function fits(name, width, height) {
	var font = tdf.loadfont(name);
	if (!font)
		return false;

	var words = PHASE1.concat(PHASE2);
	for (var i = 0; i < words.length; i++) {
		/*	getwidth() is what actually reads the glyphs, and font.height is not
			filled in until they have been read -- checking the height first
			would be checking a zero. */
		var w = tdf.getwidth(words[i], font);
		if (w < 1 || w > width - 4)
			return false;
	}

	if (font.height < MIN_HEIGHT || font.height > MAX_HEIGHT)
		return false;

	return (2 * font.height) + GAP <= stageFor(height);
}

/*	Rows the stacked title has to live in, once the lower third has taken its cut. */
function stageFor(height) {
	return height - LOWER_ROWS;
}

function cacheName(width, height) {
	return CACHE_KEY + "_" + width + "x" + height;
}

function readCache(width, height) {
	var f = new File(js.exec_dir + CACHE);
	if (!f.open("r"))
		return [];
	var list = f.iniGetValue(null, cacheName(width, height), []);
	f.close();
	return list || [];
}

function writeCache(width, height, list) {
	var f = new File(js.exec_dir + CACHE);
	if (!f.open(f.exists ? "r+" : "w+"))
		return;
	f.iniSetValue(null, cacheName(width, height), list);
	f.close();
}

/*	Measure every font.  Slow, and meant to be run once -- by buildcache.js, at
	install -- not from inside the door. */
function buildCache(width, height) {
	var files = tdf.getlist();
	var fit = [];
	for (var i = 0; i < files.length; i++) {
		var name = file_getname(files[i]).replace(/\.tdf$/i, "");
		try {
			if (fits(name, width, height))
				fit.push(name);
		} catch (e) {
			continue;			// a font we cannot read is a font we do not use
		}
	}
	writeCache(width, height, fit);
	return fit;
}

/*	Prefers the cache; failing that tries a handful at random and remembers the
	ones that worked, so a missing cache costs one visitor a short list rather
	than costing them three seconds. */
function fontsFor(width, height) {
	var cached = readCache(width, height);
	if (cached.length)
		return cached;

	var files = tdf.getlist();
	var fit = [];
	for (var n = 0; n < SAMPLE && files.length; n++) {
		var name = file_getname(files[random(files.length)]).replace(/\.tdf$/i, "");
		try {
			if (fits(name, width, height))
				fit.push(name);
		} catch (e) {
			continue;
		}
	}
	if (fit.length)
		writeCache(width, height, fit);
	return fit;
}

/*	Everything the sequence needs to draw itself, worked out once: the two logos
	as absolute-positioned cells, and where the lower third sits.  Returns null
	if no font will do the job, and the caller simply skips the splash -- a
	missing splash is better than a broken one. */
function stage(width, height, fontName) {
	var fonts = fontName ? [fontName] : fontsFor(width, height);
	if (!fonts.length)
		return null;

	var font;
	try {
		font = tdf.loadfont(fonts[random(fonts.length)]);
		tdf.getwidth(PHASE1[0], font);			// forces the glyphs to be read
	} catch (e) {
		return null;
	}
	if (!font || !font.glyphs)
		return null;

	/*	Centre the whole assembly -- the stacked logo and the lower third under it
		-- rather than centring the logo and letting the lower third hang off the
		bottom of it.  Centre the logo alone and the screen ends up top-heavy,
		with the title floating above a band of dead rows. */
	var h = font.height;
	var blockH = (2 * h) + GAP;
	var top = Math.floor((height - (blockH + LOWER_ROWS)) / 2);
	if (top < 0)
		top = 0;

	/*	Both phases are laid out on the same two rows, so the new title lands
		where the old one stood.  A logo that arrives somewhere else is a cut,
		not a transition. */
	var rowA = top;
	var rowB = top + h + GAP;

	function place(word, row) {
		var w = wordCells(word, font);
		var x0 = Math.floor((width - w.width) / 2);
		if (x0 < 0)
			x0 = 0;
		var out = [];
		for (var i = 0; i < w.cells.length; i++) {
			out.push({
				x: x0 + w.cells[i].x,
				y: row + w.cells[i].y,
				ch: w.cells[i].ch,
				attr: w.cells[i].attr
			});
		}
		return { cells: out, x: x0, width: w.width };
	}

	var nerd = place(PHASE1[0], rowA);
	var news = place(PHASE1[1], rowB);
	var dev = place(PHASE2[0], rowA);
	var log = place(PHASE2[1], rowB);

	var old = nerd.cells.concat(news.cells);
	var oldLeft = width, oldRight = 0;
	for (var i = 0; i < old.length; i++) {
		if (old[i].x < oldLeft) oldLeft = old[i].x;
		if (old[i].x > oldRight) oldRight = old[i].x;
	}

	var newLeft = Math.min(dev.x, log.x);
	var newRight = Math.max(dev.x + dev.width, log.x + log.width) - 1;

	return {
		font: font,
		width: width,
		height: height,
		old: old,
		oldLeft: oldLeft,
		oldRight: oldRight,
		dev: dev,
		log: log,
		newLeft: newLeft,
		newRight: newRight,
		top: top,
		bottom: rowB + h - 1,
		ruleRow: rowB + h + 1,
		tagRow: rowB + h + 2,
		dateRow: rowB + h + 3
	};
}

/*	A blank cell buffer for one tick.  We compose the whole frame every tick and
	blit it, rather than tracking what moved: setData already drops any cell
	whose character and attribute are unchanged, so the wire only ever carries
	the difference.  Working out the difference ourselves would buy nothing and
	cost the one thing that makes flying text tractable -- being able to draw a
	moving word by simply drawing it in its new place. */
function newBuffer(width, height) {
	var buf = [];
	for (var y = 0; y < height; y++) {
		var row = [];
		for (var x = 0; x < width; x++)
			row.push(null);
		buf.push(row);
	}
	return buf;
}

function put(buf, x, y, ch, attr) {
	if (y < 0 || y >= buf.length)
		return;
	if (x < 0 || x >= buf[y].length)
		return;
	buf[y][x] = { ch: ch, attr: attr };
}

function blit(frame, buf) {
	for (var y = 0; y < buf.length; y++) {
		for (var x = 0; x < buf[y].length; x++) {
			var c = buf[y][x];
			if (c)
				frame.setData(x, y, c.ch, c.attr, false);
			else
				frame.setData(x, y, " ", BLANK_ATTR, false);
		}
	}
}

/*	The wipe bar: a bright core with a shaded tail dragging behind it.  It is the
	only thing on screen that is not the logo, and it does all the transitional
	work -- it reveals the first title, and it carries the first title off. */
function drawBar(buf, st, x, dir) {
	for (var y = st.top; y <= st.bottom; y++) {
		for (var i = 0; i < BAR_W; i++)
			put(buf, x - (dir * i), y, SOLID, WHITE | HIGH);
		for (var t = 0; t < BAR_TAIL; t++) {
			var tx = x - (dir * (BAR_W + t));
			put(buf, tx, y, SHADE[SHADE.length - 1 - t] || SHADE[0], CYAN | HIGH);
		}
	}
}

/*	A word in flight: its cells, shifted to wherever it has got to, and blown out
	to white for as long as `punch` says it is still landing. */
function drawFlying(buf, word, x, punch) {
	var dx = x - word.x;
	for (var i = 0; i < word.cells.length; i++) {
		var c = word.cells[i];
		var attr = c.attr;
		if (punch > 0.5)
			attr = (c.attr & 0x70) | WHITE | HIGH;
		else if (punch > 0)
			attr = c.attr | HIGH;
		put(buf, c.x + dx, c.y, c.ch, attr);
	}
}

/*	Left-to-right character reveal, the same wipe the bar does, applied to text.
	It is what keeps the lower third in the same visual language as the logo. */
function drawWipedText(buf, text, x0, y, attr, progress) {
	var upto = Math.floor(text.length * progress);
	for (var i = 0; i < text.length && i < upto; i++)
		put(buf, x0 + i, y, text.charAt(i), attr);
}

function dateline() {
	var now = new Date();
	var name = system.name || "this system";
	// CP437 0xFA is the middle dot; 0xB7 -- the Latin-1 one -- is a box corner here.
	var line = "LIVE FROM " + name.toUpperCase() + " \xFA " +
		DAYS[now.getDay()].toUpperCase() + ", " +
		MONTHS[now.getMonth()].toUpperCase() + " " + now.getDate();
	return line;
}

/*	Draw the whole sequence at tick `t` into `buf`.  Kept as one function of time
	rather than a chain of loops so the beats can overlap: every element decides
	for itself whether it is on screen at t, which is the only sane way to have a
	bar still wiping the old title away while the new one is already in flight. */
function compose(buf, st, t) {

	var i, cell, attr;

	/*	--- The old title: NERD / NEWS ------------------------------------- */
	var oldSpan = st.oldRight - st.oldLeft + 1;
	var wipeOutEnd = T.wipeOut + T.wipeOutLen;

	if (t < wipeOutEnd) {

		// Where the reveal bar has got to, and where the light is.
		var revealX = (t < T.wipeIn + T.wipeInLen)
			? st.oldLeft - BAR_TAIL + Math.ceil(((oldSpan + BAR_TAIL + BAR_W) * (t + 1)) / T.wipeInLen)
			: st.oldRight + 1;

		var shine = -999;
		if (t >= T.glint1 && t < T.glint1 + T.glint1Len) {
			var gp = (t - T.glint1) / (T.glint1Len - 1);
			shine = st.oldLeft + Math.round(gp * (oldSpan + 4)) - 2;
		}

		var flashing = (t >= T.flash && t < T.flash + T.flashLen);

		// Where the bar carrying the title off has got to.
		var outX = -999;
		if (t >= T.wipeOut) {
			var op = (t - T.wipeOut + 1) / T.wipeOutLen;
			outX = st.oldLeft - BAR_TAIL + Math.round(op * (oldSpan + BAR_TAIL + BAR_W + 2));
		}

		for (i = 0; i < st.old.length; i++) {
			cell = st.old[i];

			if (cell.x >= revealX)
				continue;						// the reveal has not reached it
			if (outX > -999 && cell.x <= outX)
				continue;						// the wipe has already taken it

			attr = cell.attr;
			if (flashing) {
				attr = (cell.attr & 0x70) | WHITE | HIGH;
			} else if (shine > -999) {
				var d = Math.abs(cell.x - shine);
				if (d < 2)
					attr = (cell.attr & 0x70) | WHITE | HIGH;
				else if (d < 4)
					attr = cell.attr | HIGH;
			}
			put(buf, cell.x, cell.y, cell.ch, attr);
		}

		if (t < T.wipeIn + T.wipeInLen && revealX <= st.oldRight + BAR_W)
			drawBar(buf, st, revealX, 1);
		if (outX > -999 && outX <= st.oldRight + BAR_W + 2)
			drawBar(buf, st, outX, 1);
	}

	/*	--- The new title: DEV from the left, LOG from the right ------------ */
	if (t >= T.fly) {
		var fp = clamp((t - T.fly + 1) / T.flyLen, 0, 1);
		var e = easeOut(fp);

		var devFrom = -st.dev.width - 2;
		var logFrom = st.width + 2;
		var devX = Math.round(devFrom + ((st.dev.x - devFrom) * e));
		var logX = Math.round(logFrom + ((st.log.x - logFrom) * e));

		/*	The landing.  Two ticks of white that decays back to the artist's
			colours -- long enough to register as an impact, short enough not to
			look like a fault. */
		var punch = 0;
		if (t >= T.impact && t < T.impact + T.impactLen)
			punch = 1 - ((t - T.impact) / T.impactLen);

		drawFlying(buf, st.dev, devX, punch);
		drawFlying(buf, st.log, logX, punch);
	}

	/*	--- The lower third -------------------------------------------------
		The rule is not drawn, it is fired: it comes out of the seam where the
		two words landed and runs to the edges, so the news bar is a consequence
		of the impact rather than a thing that fades in next to it. */
	if (t >= T.impact) {
		var rp = clamp((t - T.impact + 1) / (T.impactLen + 2), 0, 1);
		var mid = Math.floor((st.newLeft + st.newRight) / 2);
		var reach = Math.round(easeOut(rp) * ((st.newRight - st.newLeft) / 2 + 4));
		var ruleAttr = (rp < 0.6) ? (WHITE | HIGH) : (CYAN | HIGH);
		for (var x = mid - reach; x <= mid + reach; x++)
			put(buf, x, st.ruleRow, RULE, ruleAttr);
	}

	if (t >= T.lower) {
		var lp = clamp((t - T.lower + 1) / T.lowerLen, 0, 1);

		var tag = TAGLINE;
		var tagX = Math.floor((st.width - tag.length) / 2);
		drawWipedText(buf, tag, tagX, st.tagRow, WHITE | HIGH, clamp(lp * 1.6, 0, 1));

		var date = dateline();
		if (date.length > st.width - 2)
			date = date.substr(0, st.width - 2);
		var dateX = Math.floor((st.width - date.length) / 2);
		drawWipedText(buf, date, dateX, st.dateRow, CYAN, clamp((lp - 0.35) * 1.9, 0, 1));
	}

	/*	The glint over the new title, last thing, so the sequence ends on the
		logo looking like metal rather than on it just sitting there. */
	if (t >= T.glint2 && t < T.glint2 + T.glint2Len) {
		var sp = (t - T.glint2) / (T.glint2Len - 1);
		var newSpan = st.newRight - st.newLeft + 1;
		var lx = st.newLeft + Math.round(sp * (newSpan + 4)) - 2;
		var all = st.dev.cells.concat(st.log.cells);
		for (i = 0; i < all.length; i++) {
			cell = all[i];
			var dd = Math.abs(cell.x - lx);
			if (dd < 2)
				put(buf, cell.x, cell.y, cell.ch, (cell.attr & 0x70) | WHITE | HIGH);
			else if (dd < 4)
				put(buf, cell.x, cell.y, cell.ch, cell.attr | HIGH);
		}
	}
}

/*	Run the sequence in `frame`.  Returns the key that interrupted it, if one
	did, so the caller can act on it rather than eat it -- a splash you cannot
	dismiss stops being a treat and becomes a toll. */
function play(frame, opts) {
	opts = opts || {};

	var st = stage(frame.width, frame.height, opts.font);
	if (!st)
		return "";							// nothing fits: no splash, no delay

	var tick = opts.tick || TICK_MS;

	for (var t = 0; t <= T.end && !js.terminated; t++) {
		var buf = newBuffer(frame.width, frame.height);
		compose(buf, st, t);
		blit(frame, buf);
		frame.cycle();

		var key = console.inkey(K_NONE, tick);
		if (key != "")
			return key;						// any key at all, and we are done here
	}

	return "";
}

/*	What the sequence costs, in milliseconds.  Used by the tests to hold it to
	its budget -- it is far too easy to make a splash slow again by adding one
	more beat, and nobody profiles a splash screen. */
function duration() {
	return (T.end + 1) * TICK_MS;
}

this;
