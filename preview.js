/*	Renders the splash, frame by frame, to a standalone HTML page that plays it
	back, so the sequence can be watched and re-timed without dialling in.

		jsexec -c /sbbs/ctrl /sbbs/xtrn/dev-log/preview.js /tmp/splash.html [font]

	Give it a font name to pin the font; leave it off and it picks at random from
	the cache, the same way the door does.

	Development aid only; nothing in the door loads this.  Kept to plain ASCII on
	purpose -- Synchronet strings are bytes, so a UTF-8 literal in here would be
	indexed a byte at a time rather than a character at a time.  Anything outside
	ASCII goes out as a numeric HTML entity. */

load("sbbsdefs.js");

var splash = load({}, js.exec_dir + "splash.js");

var WIDTH = 80;
var HEIGHT = 24;

var out = argv[0] || "/tmp/splash.html";
var pin = argv[1] || undefined;

var CGA = [
	"#000000", "#0000aa", "#00aa00", "#00aaaa", "#aa0000", "#aa00aa", "#aa5500", "#aaaaaa",
	"#555555", "#5555ff", "#55ff55", "#55ffff", "#ff5555", "#ff55ff", "#ffff55", "#ffffff"
];

// CP437 -> Unicode code points.
var CP437 = [
	0x0020, 0x263A, 0x263B, 0x2665, 0x2666, 0x2663, 0x2660, 0x2022,
	0x25D8, 0x25CB, 0x25D9, 0x2642, 0x2640, 0x266A, 0x266B, 0x263C,
	0x25BA, 0x25C4, 0x2195, 0x203C, 0x00B6, 0x00A7, 0x25AC, 0x21A8,
	0x2191, 0x2193, 0x2192, 0x2190, 0x221F, 0x2194, 0x25B2, 0x25BC
];
for (var i = 32; i < 127; i++)
	CP437[i] = i;
CP437[127] = 0x2302;
var HIGH_HALF = [
	0x00C7, 0x00FC, 0x00E9, 0x00E2, 0x00E4, 0x00E0, 0x00E5, 0x00E7,
	0x00EA, 0x00EB, 0x00E8, 0x00EF, 0x00EE, 0x00EC, 0x00C4, 0x00C5,
	0x00C9, 0x00E6, 0x00C6, 0x00F4, 0x00F6, 0x00F2, 0x00FB, 0x00F9,
	0x00FF, 0x00D6, 0x00DC, 0x00A2, 0x00A3, 0x00A5, 0x20A7, 0x0192,
	0x00E1, 0x00ED, 0x00F3, 0x00FA, 0x00F1, 0x00D1, 0x00AA, 0x00BA,
	0x00BF, 0x2310, 0x00AC, 0x00BD, 0x00BC, 0x00A1, 0x00AB, 0x00BB,
	0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556,
	0x2555, 0x2563, 0x2551, 0x2557, 0x255D, 0x255C, 0x255B, 0x2510,
	0x2514, 0x2534, 0x252C, 0x251C, 0x2500, 0x253C, 0x255E, 0x255F,
	0x255A, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256C, 0x2567,
	0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256B,
	0x256A, 0x2518, 0x250C, 0x2588, 0x2584, 0x258C, 0x2590, 0x2580,
	0x03B1, 0x00DF, 0x0393, 0x03C0, 0x03A3, 0x03C3, 0x00B5, 0x03C4,
	0x03A6, 0x0398, 0x03A9, 0x03B4, 0x221E, 0x03C6, 0x03B5, 0x2229,
	0x2261, 0x00B1, 0x2265, 0x2264, 0x2320, 0x2321, 0x00F7, 0x2248,
	0x00B0, 0x2219, 0x00B7, 0x221A, 0x207F, 0x00B2, 0x25A0, 0x00A0
];
for (i = 0; i < HIGH_HALF.length; i++)
	CP437[128 + i] = HIGH_HALF[i];

function glyph(code) {
	var cp = CP437[code & 0xff];
	if (cp == 0x26) return "&amp;";
	if (cp == 0x3c) return "&lt;";
	if (cp == 0x3e) return "&gt;";
	if (cp == 0x22) return "&quot;";
	if (cp == 0x20) return "&nbsp;";
	if (cp < 127) return String.fromCharCode(cp);
	return "&#" + cp + ";";
}

/*	One frame as HTML, runs of identical colour collapsed into one span so the
	page stays small enough to open. */
function frameHtml(buf) {
	var html = "";
	for (var y = 0; y < buf.length; y++) {
		var run = "", runFg = -1, runBg = -1;
		for (var x = 0; x < buf[y].length; x++) {
			var cell = buf[y][x];
			var ch = cell ? cell.ch : " ";
			var attr = cell ? cell.attr : 7;
			var fg = attr & 0x0f;
			var bg = (attr >> 4) & 0x07;
			if (fg != runFg || bg != runBg) {
				if (run.length)
					html += "<span style=\"color:" + CGA[runFg] + ";background:" + CGA[runBg] + "\">" + run + "</span>";
				run = "";
				runFg = fg;
				runBg = bg;
			}
			run += glyph(ch.charCodeAt(0));
		}
		if (run.length)
			html += "<span style=\"color:" + CGA[runFg] + ";background:" + CGA[runBg] + "\">" + run + "</span>";
		html += "\n";
	}
	return html;
}

var st = splash.stage(WIDTH, HEIGHT, pin);
if (!st)
	throw new Error("no font fits " + WIDTH + "x" + HEIGHT + " -- run buildcache.js");

var fontName = file_getname(st.font.filename);
writeln("font: " + fontName + " (height " + st.font.height + ")");

var frames = [];
for (var t = 0; t <= splash.T.end; t++) {
	var buf = splash.newBuffer(WIDTH, HEIGHT);
	splash.compose(buf, st, t);
	frames.push(frameHtml(buf));
}
writeln("frames: " + frames.length + "  duration: " + splash.duration() + "ms");

var json = "[";
for (i = 0; i < frames.length; i++) {
	if (i) json += ",";
	json += "\"" + frames[i].replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n") + "\"";
}
json += "]";

var page = "";
page += "<!doctype html><meta charset=\"utf-8\"><title>dev-log splash: " + fontName + "</title>\n";
page += "<style>\n";
page += "body{background:#111;color:#aaa;font-family:system-ui,sans-serif;margin:0;padding:24px;display:flex;flex-direction:column;align-items:center;gap:16px}\n";
page += "pre{font-family:'Cascadia Mono','DejaVu Sans Mono',monospace;font-size:15px;line-height:1.0;letter-spacing:0;background:#000;padding:12px;margin:0;border:1px solid #333}\n";
page += "span{white-space:pre}\n";
page += ".bar{display:flex;gap:12px;align-items:center}\n";
page += "button{background:#222;color:#ddd;border:1px solid #444;padding:6px 14px;font:inherit;cursor:pointer}\n";
page += "input[type=range]{width:320px}\n";
page += ".meta{font-size:13px;color:#777}\n";
page += "</style>\n";
page += "<div class=\"meta\">font <b>" + fontName + "</b> &middot; " + frames.length + " frames &middot; " + splash.duration() + "ms &middot; 25ms/tick</div>\n";
page += "<pre id=\"screen\"></pre>\n";
page += "<div class=\"bar\">\n";
page += "<button id=\"play\">replay</button>\n";
page += "<input type=\"range\" id=\"scrub\" min=\"0\" max=\"" + (frames.length - 1) + "\" value=\"0\">\n";
page += "<span class=\"meta\" id=\"tick\">tick 0</span>\n";
page += "</div>\n";
page += "<script>\n";
page += "var F=" + json + ";\n";
page += "var screen=document.getElementById('screen'),scrub=document.getElementById('scrub'),tick=document.getElementById('tick');\n";
page += "var t=0,timer=null;\n";
page += "function draw(i){t=i;screen.innerHTML=F[i];scrub.value=i;tick.textContent='tick '+i+' ('+(i*25)+'ms)';}\n";
page += "function play(){clearInterval(timer);t=0;timer=setInterval(function(){if(t>=F.length){clearInterval(timer);return;}draw(t++);},25);}\n";
page += "document.getElementById('play').onclick=play;\n";
page += "scrub.oninput=function(){clearInterval(timer);draw(+scrub.value);};\n";
page += "draw(0);play();\n";
page += "</script>\n";

var f = new File(out);
if (!f.open("w"))
	throw new Error("cannot write " + out);
f.write(page);
f.close();

writeln("wrote " + out);
