"use strict";

load("sbbsdefs.js");
load("frame.js");

var CONFIG = {
	repositoriesIni: js.exec_dir + "repositories.ini",
	recentChangesCount: 30,
	activityWeeks: 53,
	commitLogCount: 250
};

var STATE = {
	repositories: [],
	cache: {
		latest: {},
		changes: {},
		activity: {},
		overallActivity: null
	}
};

var UI = {
	active: false,
	row: 1,
	width: 80,
	height: 24,
	left: 1,
	rootFrame: null,
	contentFrame: null,
	lastCols: 0,
	lastRows: 0
};

var CH = {
	H: "\xC4",
	V: "\xB3",
	TL: "\xDA",
	TR: "\xBF",
	BL: "\xC0",
	BR: "\xD9",
	L: "\xC3",
	R: "\xB4",
	X: "\xC5",
	S1: "\xB0",
	S2: "\xB1",
	S3: "\xB2",
	BLOCK: "\xDB"
};

var CLR = {
	reset: "\x01n",
	border: "\x01n\x01h\x01b",
	title: "\x01n\x01h\x01c",
	heading: "\x01n\x01h\x01w",
	label: "\x01n\x01h\x01y",
	value: "\x01n\x01w",
	subtle: "\x01n\x01c",
	dim: "\x01n\x01h\x01k",
	alt: "\x01n\x01h\x01m",
	ok: "\x01n\x01h\x01g",
	warn: "\x01n\x01h\x01y",
	bad: "\x01n\x01h\x01r",
	a1: "\x01n\x01b",
	a2: "\x01n\x01c",
	a3: "\x01n\x01h\x01g",
	a4: "\x01n\x01h\x01y",
	a5: "\x01n\x01h\x01r"
};

if (typeof KEY_UP === "undefined") var KEY_UP = "\x1e";
if (typeof KEY_DOWN === "undefined") var KEY_DOWN = "\x0a";
if (typeof KEY_LEFT === "undefined") var KEY_LEFT = "\x1d";
if (typeof KEY_RIGHT === "undefined") var KEY_RIGHT = "\x06";
if (typeof KEY_ESC === "undefined") var KEY_ESC = "\x1b";

function trimStr(str) {
	if (typeof str !== "string") {
		return "";
	}
	return str.replace(/^\s+|\s+$/g, "");
}

function stripQuotes(str) {
	str = trimStr(str);
	if (str.length < 2) {
		return str;
	}
	var first = str.charAt(0);
	var last = str.charAt(str.length - 1);
	if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
		return str.substring(1, str.length - 1);
	}
	return str;
}

function padRight(str, width) {
	str = String(str);
	if (str.length >= width) {
		return str;
	}
	return str + new Array(width - str.length + 1).join(" ");
}

function padLeft(str, width) {
	str = String(str);
	if (str.length >= width) {
		return str;
	}
	return new Array(width - str.length + 1).join(" ") + str;
}

function truncateText(str, maxLen) {
	str = String(str || "");
	if (str.length <= maxLen) {
		return str;
	}
	if (maxLen < 4) {
		return str.substring(0, maxLen);
	}
	return str.substring(0, maxLen - 3) + "...";
}

function sanitizeText(str) {
	return String(str || "").replace(/[\x00-\x1f\x7f]/g, " ");
}

function repeatChar(ch, count) {
	if (count <= 0) {
		return "";
	}
	return new Array(count + 1).join(ch);
}

function stripCtrlA(str) {
	return String(str || "").replace(/\x01./g, "");
}

function visibleLen(str) {
	return stripCtrlA(str).length;
}

function padRightAnsi(str, width) {
	var len = visibleLen(str);
	if (len >= width) {
		return str;
	}
	return str + repeatChar(" ", width - len);
}

function padCenter(str, width) {
	str = String(str || "");
	if (str.length >= width) {
		return truncateText(str, width);
	}
	var left = Math.floor((width - str.length) / 2);
	var right = width - str.length - left;
	return repeatChar(" ", left) + str + repeatChar(" ", right);
}

function termWidth() {
	var width = console.screen_columns || 80;
	if (width >= 80) {
		return 80;
	}
	if (width < 60) {
		width = 60;
	}
	return width;
}

function termLeftPad(contentWidth) {
	var cols = console.screen_columns || contentWidth || 80;
	if (!contentWidth) {
		contentWidth = termWidth();
	}
	if (cols <= contentWidth) {
		return 0;
	}
	return Math.floor((cols - contentWidth) / 2);
}

function beginCenteredViewport(width, height) {
	var cols = console.screen_columns || 80;
	var rows = console.screen_rows || 24;
	var targetWidth = Math.min(width || termWidth(), cols);
	var targetHeight = Math.min(height || 24, rows);
	var left = Math.floor((cols - targetWidth) / 2) + 1;
	if (left < 1) {
		left = 1;
	}

	var needsRebuild = !UI.rootFrame ||
		!UI.contentFrame ||
		UI.lastCols !== cols ||
		UI.lastRows !== rows ||
		UI.width !== targetWidth ||
		UI.height !== targetHeight ||
		UI.left !== left;

	if (needsRebuild) {
		endCenteredViewport();
		UI.rootFrame = new Frame();
		UI.rootFrame.checkbounds = false;
		UI.contentFrame = new Frame(left, 1, targetWidth, targetHeight, undefined, UI.rootFrame);
		UI.contentFrame.v_scroll = false;
		UI.rootFrame.open();
		UI.contentFrame.open();
		UI.lastCols = cols;
		UI.lastRows = rows;
		UI.width = targetWidth;
		UI.height = targetHeight;
		UI.left = left;
	}

	UI.contentFrame.clear();
	UI.contentFrame.home();
	UI.active = true;
	UI.row = 1;
}

function cycleCenteredViewport() {
	if (UI.rootFrame) {
		UI.rootFrame.cycle();
	}
}

function endCenteredViewport() {
	UI.active = false;
	UI.row = 1;
	if (UI.rootFrame) {
		try { UI.rootFrame.close(); } catch (e1) {}
		try { UI.rootFrame.delete(); } catch (e2) {}
	}
	UI.rootFrame = null;
	UI.contentFrame = null;
	UI.lastCols = 0;
	UI.lastRows = 0;
}

function uiPrint(text, contentWidth) {
	if (UI.active && UI.contentFrame) {
		if (UI.row < 1 || UI.row > UI.height) {
			UI.row += 1;
			return;
		}
		UI.contentFrame.gotoxy(1, UI.row);
		UI.contentFrame.cleartoeol();
		UI.contentFrame.gotoxy(1, UI.row);
		UI.contentFrame.putmsg(String(text || ""));
		UI.row += 1;
		return;
	}

	var width = contentWidth || termWidth();
	var pad = termLeftPad(width);
	if (pad > 0) {
		console.print(repeatChar(" ", pad) + String(text || ""));
		return;
	}
	console.print(text);
}

function tableTop(width) {
	uiPrint(CLR.border + CH.TL + repeatChar(CH.H, width - 2) + CH.TR + CLR.reset, width);
}

function tableSep(width) {
	uiPrint(CLR.border + CH.L + repeatChar(CH.H, width - 2) + CH.R + CLR.reset, width);
}

function tableBottom(width) {
	uiPrint(CLR.border + CH.BL + repeatChar(CH.H, width - 2) + CH.BR + CLR.reset, width);
}

function tableRowPlain(text, color, width) {
	var inner = width - 2;
	text = padRight(truncateText(text, inner), inner);
	uiPrint(CLR.border + CH.V + (color || CLR.value) + text + CLR.border + CH.V + CLR.reset, width);
}

function tableRowAnsi(text, width) {
	var inner = width - 2;
	text = padRightAnsi(text, inner);
	if (visibleLen(text) > inner) {
		text = truncateText(stripCtrlA(text), inner);
	}
	uiPrint(CLR.border + CH.V + text + CLR.border + CH.V + CLR.reset, width);
}

function makeColumns(parts, widths) {
	var out = "";
	var i;
	for (i = 0; i < parts.length; i++) {
		if (i > 0) {
			out += " ";
		}
		out += padRight(truncateText(String(parts[i] || ""), widths[i]), widths[i]);
	}
	return out;
}

function joinPath(dir, fileName) {
	if (!dir) {
		return fileName;
	}
	var last = dir.charAt(dir.length - 1);
	if (last === "/" || last === "\\") {
		return dir + fileName;
	}
	return dir + "/" + fileName;
}

function isAbsolutePath(path) {
	return path.indexOf("/") === 0 || /^[A-Za-z]:[\\/]/.test(path);
}

function isRemoteRepoTarget(path) {
	return /^(https?|ssh|git):\/\//i.test(path) || /^git@/i.test(path);
}

function resolveRepoPath(path) {
	path = stripQuotes(path);
	if (!path) {
		return "";
	}
	if (isRemoteRepoTarget(path) || isAbsolutePath(path)) {
		return path;
	}
	return js.exec_dir + path;
}

function inferRepoName(path) {
	path = String(path || "").replace(/[\\\/]+$/, "");
	if (!path) {
		return "repository";
	}
	var slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	var name = slash >= 0 ? path.substring(slash + 1) : path;
	name = name.replace(/\.git$/i, "");
	return name || "repository";
}

function shellQuote(str) {
	return "'" + String(str).replace(/'/g, "'\"'\"'") + "'";
}

function makeDateKey(dateObj) {
	return padLeft(String(dateObj.getFullYear()), 4) + "-" +
		padLeft(String(dateObj.getMonth() + 1), 2).replace(/ /g, "0") + "-" +
		padLeft(String(dateObj.getDate()), 2).replace(/ /g, "0");
}

function getActivityStartDateKey() {
	var now = new Date();
	now.setHours(0, 0, 0, 0);
	now.setDate(now.getDate() - ((CONFIG.activityWeeks * 7) - 1));
	return makeDateKey(now);
}

function maybeAddRootRepo(repos, key, value) {
	key = trimStr(key);
	value = trimStr(value);
	if (!value) {
		return;
	}
	var lower = key.toLowerCase();
	if (lower === "path" || lower === "dir" || lower === "repo" || lower === "repository") {
		repos.push({ name: "", path: value });
		return;
	}
	if (value.indexOf("/") >= 0 || value.indexOf("\\") >= 0 || /\.git$/i.test(value) || value.charAt(0) === ".") {
		repos.push({ name: key, path: value });
	}
}

function finalizeSectionRepo(repos, sectionData) {
	if (!sectionData) {
		return;
	}
	var repoPath = sectionData.path ||
		sectionData.dir ||
		sectionData.repo ||
		sectionData.repository ||
		sectionData.location ||
		sectionData.url ||
		sectionData.remote;
	if (!repoPath && sectionData.section && (sectionData.section.indexOf("/") >= 0 || sectionData.section.indexOf("\\") >= 0)) {
		repoPath = sectionData.section;
	}
	if (!repoPath) {
		return;
	}
	repos.push({
		name: sectionData.name || sectionData.section || "",
		path: repoPath
	});
}

function normalizeRepositories(rawRepos) {
	var out = [];
	var seen = {};
	var i;
	for (i = 0; i < rawRepos.length; i++) {
		var path = resolveRepoPath(rawRepos[i].path || "");
		if (!path) {
			continue;
		}
		path = path.replace(/[\\\/]+$/, "");
		var name = trimStr(rawRepos[i].name || "");
		if (!name) {
			name = inferRepoName(path);
		}
		var key = path.toLowerCase();
		if (seen[key]) {
			continue;
		}
		seen[key] = true;
		out.push({
			name: name,
			path: path,
			isRemote: isRemoteRepoTarget(path)
		});
	}
	return out;
}

function loadRepositories() {
	var repos = [];
	var iniFile = new File(CONFIG.repositoriesIni);
	if (!iniFile.exists || !iniFile.open("r")) {
		return repos;
	}

	var currentSection = null;
	while (!iniFile.eof) {
		var raw = iniFile.readln(2048);
		if (typeof raw !== "string") {
			continue;
		}
		var line = trimStr(raw);
		if (!line || line.charAt(0) === ";" || line.charAt(0) === "#") {
			continue;
		}

		if (line.charAt(0) === "[" && line.charAt(line.length - 1) === "]") {
			finalizeSectionRepo(repos, currentSection);
			currentSection = {
				section: trimStr(line.substring(1, line.length - 1))
			};
			continue;
		}

		var eqPos = line.indexOf("=");
		if (eqPos >= 0) {
			var key = trimStr(line.substring(0, eqPos));
			var value = stripQuotes(line.substring(eqPos + 1));
			if (currentSection) {
				currentSection[key.toLowerCase()] = value;
			} else {
				maybeAddRootRepo(repos, key, value);
			}
			continue;
		}

		if (currentSection) {
			if (!currentSection.path) {
				currentSection.path = line;
			}
		} else {
			repos.push({ name: "", path: line });
		}
	}

	iniFile.close();
	finalizeSectionRepo(repos, currentSection);
	return normalizeRepositories(repos);
}

function execCmdWithOutput(command) {
	var output = [];
	var tempBase = system.temp_dir || system.node_dir || js.exec_dir;
	var tempFile = joinPath(tempBase, "devlog_" + system.node_num + "_" + time() + "_" + Math.floor(Math.random() * 1000000) + ".tmp");
	var fullCommand = command + " >" + shellQuote(tempFile) + " 2>&1";
	var returnCode = system.exec(fullCommand);

	var f = new File(tempFile);
	if (f.open("r")) {
		while (!f.eof) {
			var line = f.readln(4096);
			if (typeof line === "string") {
				output.push(line);
			}
		}
		f.close();
	}

	if (file_exists(tempFile)) {
		file_remove(tempFile);
	}

	return {
		code: returnCode,
		lines: output
	};
}

function parseGitError(lines) {
	if (!lines || !lines.length) {
		return "unable to read git history";
	}
	var first = trimStr(lines[0]);
	var lower = first.toLowerCase();
	if (lower.indexOf("not a git repository") >= 0) {
		return "not a git project";
	}
	if (lower.indexOf("does not have any commits yet") >= 0 || lower.indexOf("has no commits yet") >= 0) {
		return "no changes yet";
	}
	if (lower.indexOf("no such file or directory") >= 0) {
		return "path not found";
	}
	return truncateText(first, 120);
}

function runGit(repo, args) {
	if (repo.isRemote) {
		return {
			ok: false,
			lines: ["remote project URL is not supported for local git log"],
			code: 1
		};
	}
	if (!file_isdir(repo.path)) {
		return {
			ok: false,
			lines: ["path not found: " + repo.path],
			code: 1
		};
	}

	var cmd = "git -C " + shellQuote(repo.path) + " --no-pager " + args;
	var result = execCmdWithOutput(cmd);
	result.ok = result.code === 0;
	return result;
}

function clearCaches(repoPath) {
	if (!repoPath) {
		STATE.cache.latest = {};
		STATE.cache.changes = {};
		STATE.cache.activity = {};
		STATE.cache.overallActivity = null;
		return;
	}
	delete STATE.cache.latest[repoPath];
	delete STATE.cache.activity[repoPath];
	var key;
	for (key in STATE.cache.changes) {
		if (key.indexOf(repoPath + "|") === 0) {
			delete STATE.cache.changes[key];
		}
	}
	STATE.cache.overallActivity = null;
}

function getLatestCommit(repo, forceRefresh) {
	var cacheKey = repo.path;
	if (!forceRefresh && STATE.cache.latest[cacheKey]) {
		return STATE.cache.latest[cacheKey];
	}

	var result = runGit(repo, "log -1 --date=short --pretty=format:%ad%x1f%s");
	var info;
	if (!result.ok) {
		info = { ok: false, error: parseGitError(result.lines) };
		STATE.cache.latest[cacheKey] = info;
		return info;
	}

	if (!result.lines.length) {
		info = { ok: false, error: "no changes yet" };
		STATE.cache.latest[cacheKey] = info;
		return info;
	}

	var parts = result.lines[0].split("\x1f");
	if (parts.length < 2) {
		info = { ok: false, error: "unexpected git output" };
		STATE.cache.latest[cacheKey] = info;
		return info;
	}

	info = {
		ok: true,
		date: parts[0],
		subject: sanitizeText(parts.slice(1).join("\x1f"))
	};
	STATE.cache.latest[cacheKey] = info;
	return info;
}

function getRepoChanges(repo, maxCommits, forceRefresh) {
	var cacheKey = repo.path + "|" + maxCommits;
	if (!forceRefresh && STATE.cache.changes[cacheKey]) {
		return STATE.cache.changes[cacheKey];
	}

	var result = runGit(
		repo,
		"log -n " + maxCommits + " --date=short --pretty=format:%h%x1f%ad%x1f%an%x1f%s"
	);

	if (!result.ok) {
		var errorOut = { ok: false, error: parseGitError(result.lines), commits: [] };
		STATE.cache.changes[cacheKey] = errorOut;
		return errorOut;
	}

	var commits = [];
	var i;
	for (i = 0; i < result.lines.length; i++) {
		var line = result.lines[i];
		if (!line) {
			continue;
		}
		var parts = line.split("\x1f");
		if (parts.length < 4) {
			continue;
		}
		commits.push({
			hash: parts[0],
			date: parts[1],
			author: sanitizeText(parts[2]),
			subject: sanitizeText(parts.slice(3).join("\x1f"))
		});
	}

	var out = { ok: true, commits: commits };
	STATE.cache.changes[cacheKey] = out;
	return out;
}

function getRepoActivity(repo, forceRefresh) {
	var cacheKey = repo.path;
	if (!forceRefresh && STATE.cache.activity[cacheKey]) {
		return STATE.cache.activity[cacheKey];
	}

	var since = getActivityStartDateKey();
	var result = runGit(repo, "log --since=" + since + " --date=short --pretty=format:%ad");
	if (!result.ok) {
		var errorOut = { ok: false, error: parseGitError(result.lines), counts: {}, total: 0 };
		STATE.cache.activity[cacheKey] = errorOut;
		return errorOut;
	}

	var counts = {};
	var total = 0;
	var i;
	for (i = 0; i < result.lines.length; i++) {
		var dateKey = trimStr(result.lines[i]);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
			continue;
		}
		if (typeof counts[dateKey] === "undefined") {
			counts[dateKey] = 1;
		} else {
			counts[dateKey] += 1;
		}
		total += 1;
	}

	var out = { ok: true, counts: counts, total: total };
	STATE.cache.activity[cacheKey] = out;
	return out;
}

function getOverallActivity(repos, forceRefresh) {
	if (!forceRefresh && STATE.cache.overallActivity) {
		return STATE.cache.overallActivity;
	}

	var counts = {};
	var total = 0;
	var errors = [];
	var i;
	for (i = 0; i < repos.length; i++) {
		var activity = getRepoActivity(repos[i], forceRefresh);
		if (!activity.ok) {
			errors.push(repos[i].name + ": " + activity.error);
			continue;
		}
		var dateKey;
		for (dateKey in activity.counts) {
			if (typeof counts[dateKey] === "undefined") {
				counts[dateKey] = 0;
			}
			counts[dateKey] += activity.counts[dateKey];
			total += activity.counts[dateKey];
		}
	}

	var out = {
		ok: true,
		counts: counts,
		total: total,
		errors: errors
	};
	STATE.cache.overallActivity = out;
	return out;
}

function getActivityLevel(count, maxCount) {
	if (count <= 0 || maxCount <= 0) {
		return 0;
	}
	var ratio = count / maxCount;
	if (ratio <= 0.20) {
		return 1;
	}
	if (ratio <= 0.40) {
		return 2;
	}
	if (ratio <= 0.60) {
		return 3;
	}
	if (ratio <= 0.80) {
		return 4;
	}
	return 5;
}

function activityCell(level) {
	if (level <= 0) {
		return CLR.dim + CH.S1 + CLR.reset;
	}
	if (level === 1) {
		return CLR.a1 + CH.S1 + CLR.reset;
	}
	if (level === 2) {
		return CLR.a2 + CH.S2 + CLR.reset;
	}
	if (level === 3) {
		return CLR.a3 + CH.S2 + CLR.reset;
	}
	if (level === 4) {
		return CLR.a4 + CH.S3 + CLR.reset;
	}
	return CLR.a5 + CH.BLOCK + CLR.reset;
}

function drawHeader(title, subtitle) {
	var width = termWidth();
	var inner = width - 2;
	console.clear();
	tableTop(width);
	tableRowPlain(padCenter(truncateText(title, inner), inner), CLR.title, width);
	if (subtitle) {
		tableRowPlain(" " + truncateText(subtitle, inner - 1), CLR.subtle, width);
	}
	tableSep(width);
	console.crlf();
}

function promptInput(label, maxLen, upper) {
	uiPrint(CLR.label + label + " " + CLR.reset, termWidth());
	var mode = K_LINE;
	if (upper) {
		mode |= K_UPPER;
	}
	var input = console.getstr("", maxLen || 16, mode);
	return trimStr(input || "");
}

function drawActivityGrid(counts, title, subtitle, errorList, options) {
	options = options || {};
	var compact = !!options.compact;
	var noHeader = !!options.noHeader;
	var noPause = !!options.noPause;
	var showErrors = options.showErrors !== false;

	if (!noHeader) {
		drawHeader(title, subtitle);
	}

	var today = new Date();
	today.setHours(0, 0, 0, 0);

	var totalDays = CONFIG.activityWeeks * 7;
	var startDate = new Date(today.getTime());
	startDate.setDate(today.getDate() - (totalDays - 1));
	startDate.setDate(startDate.getDate() - startDate.getDay());

	var maxCount = 0;
	var totalCommits = 0;
	var activeDays = 0;
	var dateKey;
	for (dateKey in counts) {
		var c = counts[dateKey];
		if (c > maxCount) {
			maxCount = c;
		}
		if (c > 0) {
			activeDays += 1;
			totalCommits += c;
		}
	}

	var width = termWidth();
	var inner = width - 2;
	var gridVisibleWidth = 5 + CONFIG.activityWeeks;
	var leftPad = 0;
	if (inner > gridVisibleWidth) {
		leftPad = Math.floor((inner - gridVisibleWidth) / 2);
	}

	tableTop(width);
	if (!compact) {
	tableRowAnsi(" " + CLR.heading + "Change Activity Heatmap (last " + (CONFIG.activityWeeks * 7) + " days)" + CLR.reset, width);
		tableSep(width);
	}

	var monthMarkers = repeatChar(" ", 5);
	var monthChars = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	var col;
	var lastMonth = -1;
	for (col = 0; col < CONFIG.activityWeeks; col++) {
		var weekStart = new Date(startDate.getTime());
		weekStart.setDate(startDate.getDate() + (col * 7));
		if (weekStart.getTime() > today.getTime()) {
			monthMarkers += " ";
		} else if (weekStart.getDate() <= 7 && weekStart.getMonth() !== lastMonth) {
			monthMarkers += monthChars[weekStart.getMonth()].charAt(0);
			lastMonth = weekStart.getMonth();
		} else {
			monthMarkers += " ";
		}
	}
	tableRowAnsi(repeatChar(" ", leftPad) + CLR.label + monthMarkers + CLR.reset, width);

	var dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	var row;
	for (row = 0; row < 7; row++) {
		var line = repeatChar(" ", leftPad) + CLR.label + padRight(dayLabels[row], 4) + CLR.reset + " ";
		for (col = 0; col < CONFIG.activityWeeks; col++) {
			var day = new Date(startDate.getTime());
			day.setDate(startDate.getDate() + (col * 7) + row);
			if (day.getTime() > today.getTime()) {
				line += CLR.dim + CH.S1 + CLR.reset;
				continue;
			}
			var key = makeDateKey(day);
			line += activityCell(getActivityLevel(counts[key] || 0, maxCount));
		}
		tableRowAnsi(line, width);
	}

	tableSep(width);
	tableRowAnsi(" " + CLR.label + "Total changes:" + CLR.reset + " " + CLR.ok + totalCommits + CLR.reset +
		"   " + CLR.label + "Active days:" + CLR.reset + " " + CLR.value + activeDays + CLR.reset +
		"   " + CLR.label + "Peak/day:" + CLR.reset + " " + CLR.value + maxCount + CLR.reset, width);

	if (!compact) {
		var legend = " " + CLR.label + "Legend:" + CLR.reset + " " +
			activityCell(0) + CLR.subtle + " none " + CLR.reset +
			activityCell(1) + CLR.a1 + " low " + CLR.reset +
			activityCell(2) + CLR.a2 + " med-low " + CLR.reset +
			activityCell(3) + CLR.a3 + " medium " + CLR.reset +
			activityCell(4) + CLR.a4 + " high " + CLR.reset +
			activityCell(5) + CLR.a5 + " very high" + CLR.reset;
		tableRowAnsi(legend, width);
	}

	if (showErrors && errorList && errorList.length) {
		tableSep(width);
		tableRowAnsi(" " + CLR.warn + "Skipped projects (errors)" + CLR.reset, width);
		var i;
		for (i = 0; i < errorList.length && i < 8; i++) {
			tableRowAnsi("  " + CLR.bad + "- " + CLR.reset + truncateText(errorList[i], width - 8), width);
		}
		if (errorList.length > 8) {
			tableRowAnsi("  " + CLR.warn + "...and " + (errorList.length - 8) + " more" + CLR.reset, width);
		}
	}

	tableBottom(width);
	console.crlf();
	if (!noPause) {
		console.pause();
	}
}

function showRepoDetail(repo) {
	while (bbs.online) {
		drawHeader("Project: " + repo.name, repo.path);

		var latest = getLatestCommit(repo, false);
		var width = termWidth();
		tableTop(width);
		if (latest.ok) {
			tableRowAnsi(" " + CLR.label + "Latest:" + CLR.reset + " " + CLR.ok + latest.date + CLR.reset + "  " + CLR.value + truncateText(latest.subject, width - 24) + CLR.reset, width);
		} else {
			tableRowAnsi(" " + CLR.label + "Latest:" + CLR.reset + " " + CLR.bad + "[" + latest.error + "]" + CLR.reset, width);
		}

		var changes = getRepoChanges(repo, CONFIG.recentChangesCount, false);
		tableSep(width);
		tableRowAnsi(" " + CLR.heading + "Recent Changes" + CLR.reset, width);
		tableSep(width);
		if (!changes.ok) {
			tableRowAnsi(" " + CLR.bad + "[" + changes.error + "]" + CLR.reset, width);
		} else if (!changes.commits.length) {
			tableRowAnsi(" " + CLR.warn + "[no changes]" + CLR.reset, width);
		} else {
			var inner = width - 2;
			var dateW = 10;
			var hashW = 8;
			var authorW = 14;
			var msgW = inner - (dateW + hashW + authorW + 3);
			if (msgW < 18) {
				authorW = 10;
				msgW = inner - (dateW + hashW + authorW + 3);
			}

			tableRowPlain(makeColumns(["Date", "Hash", "Author", "Message"], [dateW, hashW, authorW, msgW]), CLR.heading, width);
			tableSep(width);
			var i;
			for (i = 0; i < changes.commits.length; i++) {
				var commit = changes.commits[i];
				var row = makeColumns([commit.date, commit.hash, commit.author, commit.subject], [dateW, hashW, authorW, msgW]);
				tableRowPlain(row, (i % 2 === 0) ? CLR.value : CLR.subtle, width);
			}
		}
		tableBottom(width);

		console.crlf();
		uiPrint(CLR.label + "[A]" + CLR.reset + "ctivity grid   " +
			CLR.label + "[R]" + CLR.reset + "efresh project data   " +
			CLR.label + "[Q]" + CLR.reset + " Back", width);
		var input = promptInput("Selection:", 8, true);
		if (!input || input === "Q") {
			return;
		}
		if (input === "A") {
			var repoActivity = getRepoActivity(repo, false);
			if (!repoActivity.ok) {
				drawHeader("Project Activity: " + repo.name);
				uiPrint(CLR.bad + "Unable to load activity: " + repoActivity.error + CLR.reset, termWidth());
				console.crlf();
				console.pause();
			} else {
				drawActivityGrid(repoActivity.counts, "Project Activity: " + repo.name, repo.path);
			}
			continue;
		}
		if (input === "R") {
			clearCaches(repo.path);
			continue;
		}
	}
}

function showRepositoryListView() {
	while (bbs.online) {
		drawHeader("Dev Log - Projects", "Latest change overview");

		if (!STATE.repositories.length) {
			var emptyWidth = termWidth();
			tableTop(emptyWidth);
			tableRowAnsi(" " + CLR.warn + "No projects configured." + CLR.reset, emptyWidth);
			tableRowAnsi(" " + CLR.label + "Add project paths to:" + CLR.reset + " " + CLR.value + CONFIG.repositoriesIni + CLR.reset, emptyWidth);
			tableBottom(emptyWidth);
			console.crlf();
			console.pause();
			return;
		}

		var width = termWidth();
		var inner = width - 2;
		var numW = 3;
		var repoW = 24;
		var dateW = 10;
		var msgW = inner - (numW + repoW + dateW + 3);
		if (msgW < 18) {
			repoW = 18;
			msgW = inner - (numW + repoW + dateW + 3);
		}

		tableTop(width);
		tableRowAnsi(" " + CLR.label + "Projects loaded:" + CLR.reset + " " + CLR.ok + STATE.repositories.length + CLR.reset, width);
		tableSep(width);
		tableRowPlain(makeColumns(["#", "Project", "Date", "Latest Change"], [numW, repoW, dateW, msgW]), CLR.heading, width);
		tableSep(width);

		var i;
		for (i = 0; i < STATE.repositories.length; i++) {
			var repo = STATE.repositories[i];
			var latest = getLatestCommit(repo, false);
			var date = latest.ok ? latest.date : "-";
			var subject = latest.ok ? latest.subject : "[" + latest.error + "]";
			var line = makeColumns([(i + 1) + ".", repo.name, date, subject], [numW, repoW, dateW, msgW]);
			if (latest.ok) {
				tableRowPlain(line, (i % 2 === 0) ? CLR.value : CLR.subtle, width);
			} else {
				tableRowPlain(line, CLR.bad, width);
			}
		}
		tableBottom(width);

		console.crlf();
		uiPrint(CLR.subtle + "Enter project number to view changes." + CLR.reset, width);
		uiPrint(CLR.label + "[A]" + CLR.reset + " all-project activity grid   " +
			CLR.label + "[R]" + CLR.reset + " refresh cache   " +
			CLR.label + "[Q]" + CLR.reset + " back", width);
		var input = promptInput("Selection:", 10, true);
		if (!input || input === "Q") {
			return;
		}
		if (input === "R") {
			clearCaches();
			continue;
		}
		if (input === "A") {
			var overall = getOverallActivity(STATE.repositories, false);
				drawActivityGrid(
					overall.counts,
					"Activity - All Repositories",
					STATE.repositories.length + " projects, last " + (CONFIG.activityWeeks * 7) + " days",
					overall.errors
				);
			continue;
		}

		var index = parseInt(input, 10);
		if (isNaN(index) || index < 1 || index > STATE.repositories.length) {
			uiPrint(CLR.bad + "Invalid project selection." + CLR.reset, width);
			console.pause();
			continue;
		}
		showRepoDetail(STATE.repositories[index - 1]);
	}
}

function showOverallActivityFromMain() {
	if (!STATE.repositories.length) {
		drawHeader("Activity - All Projects", "No projects loaded");
		uiPrint(CLR.warn + "No projects configured." + CLR.reset, termWidth());
		console.pause();
		return;
	}
	var overall = getOverallActivity(STATE.repositories, false);
	drawActivityGrid(
		overall.counts,
		"Activity - All Projects",
		STATE.repositories.length + " projects, last " + (CONFIG.activityWeeks * 7) + " days",
		overall.errors
	);
}

function repoPickerLabel(selectedRepoIndex) {
	if (selectedRepoIndex <= 0) {
		return "All Projects";
	}
	return STATE.repositories[selectedRepoIndex - 1].name;
}

function getSelectedActivity(selectedRepoIndex) {
	if (selectedRepoIndex <= 0) {
		var overall = getOverallActivity(STATE.repositories, false);
		return {
			mode: "all",
			title: "All Projects",
			subtitle: "Combined activity across " + STATE.repositories.length + " projects",
			counts: overall.counts,
			errors: overall.errors
		};
	}

	var repo = STATE.repositories[selectedRepoIndex - 1];
	var activity = getRepoActivity(repo, false);
	if (!activity.ok) {
		return {
			mode: "repo",
			repo: repo,
			title: repo.name,
			subtitle: repo.path,
			counts: {},
			errors: [repo.name + ": " + activity.error]
		};
	}
	return {
		mode: "repo",
		repo: repo,
		title: repo.name,
		subtitle: repo.path,
		counts: activity.counts,
		errors: []
	};
}

function getSelectedLatest(selectedRepoIndex) {
	if (selectedRepoIndex <= 0) {
		var best = null;
		var i;
		for (i = 0; i < STATE.repositories.length; i++) {
			var repo = STATE.repositories[i];
			var latest = getLatestCommit(repo, false);
			if (!latest.ok) {
				continue;
			}
			if (!best || latest.date > best.date) {
				best = {
					ok: true,
					repo: repo.name,
					date: latest.date,
					subject: latest.subject
				};
			}
		}
		if (best) {
			return best;
		}
		return { ok: false, error: "no change data available" };
	}

	var selectedRepo = STATE.repositories[selectedRepoIndex - 1];
	var selectedLatest = getLatestCommit(selectedRepo, false);
	if (!selectedLatest.ok) {
		return { ok: false, repo: selectedRepo.name, error: selectedLatest.error };
	}
	return {
		ok: true,
		repo: selectedRepo.name,
		date: selectedLatest.date,
		subject: selectedLatest.subject
	};
}

function buildActivityRows(counts, width) {
	var today = new Date();
	today.setHours(0, 0, 0, 0);

	var totalDays = CONFIG.activityWeeks * 7;
	var startDate = new Date(today.getTime());
	startDate.setDate(today.getDate() - (totalDays - 1));
	startDate.setDate(startDate.getDate() - startDate.getDay());

	var maxCount = 0;
	var totalCommits = 0;
	var activeDays = 0;
	var dateKey;
	for (dateKey in counts) {
		var c = counts[dateKey];
		if (c > maxCount) {
			maxCount = c;
		}
		if (c > 0) {
			activeDays += 1;
			totalCommits += c;
		}
	}

	var inner = width - 2;
	var gridVisibleWidth = 5 + CONFIG.activityWeeks;
	var leftPad = 0;
	if (inner > gridVisibleWidth) {
		leftPad = Math.floor((inner - gridVisibleWidth) / 2);
	}

	var rows = [];
	var monthMarkers = repeatChar(" ", 5);
	var monthChars = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	var col;
	var lastMonth = -1;
	for (col = 0; col < CONFIG.activityWeeks; col++) {
		var weekStart = new Date(startDate.getTime());
		weekStart.setDate(startDate.getDate() + (col * 7));
		if (weekStart.getTime() > today.getTime()) {
			monthMarkers += " ";
		} else if (weekStart.getDate() <= 7 && weekStart.getMonth() !== lastMonth) {
			monthMarkers += monthChars[weekStart.getMonth()].charAt(0);
			lastMonth = weekStart.getMonth();
		} else {
			monthMarkers += " ";
		}
	}
	rows.push(repeatChar(" ", leftPad) + CLR.label + monthMarkers + CLR.reset);

	var dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	var row;
	for (row = 0; row < 7; row++) {
		var line = repeatChar(" ", leftPad) + CLR.label + padRight(dayLabels[row], 4) + CLR.reset + " ";
		for (col = 0; col < CONFIG.activityWeeks; col++) {
			var day = new Date(startDate.getTime());
			day.setDate(startDate.getDate() + (col * 7) + row);
			if (day.getTime() > today.getTime()) {
				line += CLR.dim + CH.S1 + CLR.reset;
				continue;
			}
			var key = makeDateKey(day);
			line += activityCell(getActivityLevel(counts[key] || 0, maxCount));
		}
		rows.push(line);
	}

	return {
		rows: rows,
		totalCommits: totalCommits,
		activeDays: activeDays,
		maxCount: maxCount
	};
}

function menuRowText(text, selected) {
	if (selected) {
		return "\x01n\x014\x01h\x01w " + text + " \x01n";
	}
	return " " + CLR.value + text + CLR.reset;
}

function wrapTextLines(text, width, maxLines) {
	text = trimStr(sanitizeText(text));
	if (!text) {
		return [];
	}
	if (width < 4) {
		return [truncateText(text, width)];
	}

	var words = text.split(/\s+/);
	var lines = [];
	var i = 0;
	while (i < words.length && lines.length < maxLines) {
		var line = words[i++];
		while (i < words.length && (line.length + 1 + words[i].length) <= width) {
			line += " " + words[i++];
		}
		lines.push(line);
	}

	if (i < words.length && lines.length > 0) {
		lines[lines.length - 1] = truncateText(lines[lines.length - 1], width - 3) + "...";
	}

	return lines;
}

function showMessageBox(title, message, color) {
	var width = termWidth();
	drawHeader(title);
	tableTop(width);
	tableRowAnsi(" " + (color || CLR.warn) + truncateText(message, width - 4) + CLR.reset, width);
	tableBottom(width);
	console.crlf();
	uiPrint(CLR.subtle + "Press any key..." + CLR.reset, width);
	console.getkey(K_NOCRLF | K_NOECHO | K_NOSPIN);
}

function drawMainScreen(selectedMenuIndex, selectedRepoIndex) {
	var selected = getSelectedActivity(selectedRepoIndex);
	var width = termWidth();
	var inner = width - 2;
	var activity = buildActivityRows(selected.counts, width);
	var latest = getSelectedLatest(selectedRepoIndex);

	beginCenteredViewport(width, 24);
	tableTop(width);
	tableRowPlain(padCenter("Project Activity", inner), "\x01n\x01h\x01g", width);
	tableRowAnsi(" " + CLR.subtle + "Activity:" + CLR.reset + " " + CLR.heading + selected.title + CLR.reset
		+ "  " + CLR.dim + CH.S2 + CLR.reset + "  " + CLR.subtle + "Project picker:" + CLR.reset
		+ " " + CLR.heading + repoPickerLabel(selectedRepoIndex) + CLR.reset, width);
	tableSep(width);

	var i;
	for (i = 0; i < activity.rows.length; i++) {
		tableRowAnsi(activity.rows[i], width);
	}
	tableSep(width);
	tableRowAnsi(" " + CLR.label + "Total changes:" + CLR.reset + " " + CLR.ok + activity.totalCommits + CLR.reset +
		"   " + CLR.label + "Active days:" + CLR.reset + " " + CLR.value + activity.activeDays + CLR.reset +
		"   " + CLR.label + "Peak/day:" + CLR.reset + " " + CLR.value + activity.maxCount + CLR.reset, width);
	tableSep(width);

	var kpiLabel = "\x01n\x01c";    // CYAN
	var kpiMessage = "\x01n\x01h\x01c"; // LIGHT_CYAN
	var msgPrefixLen = 9; // " Message: "

	if (latest.ok) {
		var msgWrapWidth = inner - msgPrefixLen;
		if (msgWrapWidth < 10) {
			msgWrapWidth = 10;
		}
		var wrapped = wrapTextLines(latest.subject, msgWrapWidth, 2);
		if (wrapped.length < 2) {
			wrapped.push("");
		}

		tableRowAnsi(" " + kpiLabel + "Latest:" + CLR.reset + " " + CLR.ok + latest.date + CLR.reset +
			"   " + kpiLabel + "Project:" + CLR.reset + " " + CLR.subtle + "[" + latest.repo + "]" + CLR.reset, width);
		tableRowAnsi(" " + kpiLabel + "Message:" + CLR.reset + " " + kpiMessage + wrapped[0] + CLR.reset, width);
		tableRowAnsi(" " + repeatChar(" ", 8) + kpiMessage + wrapped[1] + CLR.reset, width);
	} else {
		tableRowAnsi(" " + kpiLabel + "Latest:" + CLR.reset + " " + CLR.bad + "[" + latest.error + "]" + CLR.reset, width);
		tableRowAnsi(" " + kpiLabel + "Message:" + CLR.reset + " " + kpiMessage + "n/a" + CLR.reset, width);
		tableRowAnsi(" ", width);
	}
	tableSep(width);

	var repoText = "Project: " + CLR.label + "< " + CLR.reset + truncateText(repoPickerLabel(selectedRepoIndex), width - 24) + CLR.label + " >" + CLR.reset;
	var logText = selectedRepoIndex > 0
		? "View Ordered Change Log"
		: "View Ordered Change Log " + CLR.dim + "(select a specific project)" + CLR.reset;

	tableRowAnsi(" " + CLR.value + repoText + CLR.reset, width);
	tableRowAnsi(menuRowText(logText, selectedMenuIndex === 0), width);
	tableRowAnsi(menuRowText("Quit", selectedMenuIndex === 1), width);
	tableBottom(width);
	cycleCenteredViewport();
}

function showCommitLogView(repo) {
	var scroll = 0;
	while (bbs.online) {
		var changes = getRepoChanges(repo, CONFIG.commitLogCount, false);
		var width = termWidth();
		var rows = console.screen_rows || 24;
		var pageSize = rows - 13;
		if (pageSize < 5) {
			pageSize = 5;
		}

		drawHeader("Change Log: " + repo.name, repo.path);

		if (!changes.ok) {
			tableTop(width);
			tableRowAnsi(" " + CLR.bad + "Unable to load changes: " + changes.error + CLR.reset, width);
				tableBottom(width);
				console.crlf();
				uiPrint(CLR.subtle + "Press " + CLR.label + "Q" + CLR.subtle + " or " + CLR.label + "ESC" + CLR.subtle + " to go back." + CLR.reset, width);
			var keyErr = console.getkey(K_NOCRLF | K_NOECHO | K_NOSPIN | K_UPPER);
			if (keyErr === "Q" || keyErr === KEY_ESC || keyErr === "\x1b") {
				return;
			}
			continue;
		}

		var total = changes.commits.length;
		if (scroll > total - 1) {
			scroll = total > 0 ? total - 1 : 0;
		}

		var start = scroll;
		var end = start + pageSize;
		if (end > total) {
			end = total;
		}

		tableTop(width);
		tableRowAnsi(" " + CLR.heading + "Showing changes " + (total ? (start + 1) : 0) + "-" + end + " of " + total + " (newest first)" + CLR.reset, width);
		tableSep(width);

		var inner = width - 2;
		var dateW = 10;
		var hashW = 8;
		var authorW = 14;
		var msgW = inner - (dateW + hashW + authorW + 3);
		if (msgW < 18) {
			authorW = 10;
			msgW = inner - (dateW + hashW + authorW + 3);
		}

		tableRowPlain(makeColumns(["Date", "Hash", "Author", "Message"], [dateW, hashW, authorW, msgW]), CLR.heading, width);
		tableSep(width);

		if (total === 0) {
			tableRowAnsi(" " + CLR.warn + "No changes in project." + CLR.reset, width);
		} else {
			var i;
			for (i = start; i < end; i++) {
				var c = changes.commits[i];
				var line = makeColumns([c.date, c.hash, c.author, c.subject], [dateW, hashW, authorW, msgW]);
				tableRowPlain(line, (i % 2 === 0) ? CLR.value : CLR.subtle, width);
			}
		}

			tableBottom(width);
			console.crlf();
			uiPrint(CLR.subtle + "Keys: " + CLR.label + "UP/DOWN" + CLR.subtle + " scroll, " + CLR.label + "LEFT/RIGHT" + CLR.subtle + " page, " + CLR.label + "R" + CLR.subtle + " refresh, " + CLR.label + "Q/ESC" + CLR.subtle + " back." + CLR.reset, width);

		var key = console.getkey(K_NOCRLF | K_NOECHO | K_NOSPIN | K_UPPER);
		if (key === "Q" || key === KEY_ESC || key === "\x1b") {
			return;
		}
		if (key === "R") {
			clearCaches(repo.path);
			continue;
		}

		var maxScroll = total > 0 ? total - 1 : 0;
		if (key === KEY_UP || key === "K") {
			scroll = scroll > 0 ? scroll - 1 : 0;
			continue;
		}
		if (key === KEY_DOWN || key === "J") {
			scroll = scroll < maxScroll ? scroll + 1 : maxScroll;
			continue;
		}
		if (key === KEY_LEFT || key === "P") {
			scroll -= pageSize;
			if (scroll < 0) {
				scroll = 0;
			}
			continue;
		}
		if (key === KEY_RIGHT || key === "N") {
			scroll += pageSize;
			if (scroll > maxScroll) {
				scroll = maxScroll;
			}
			continue;
		}
	}
}

function reloadRepositories() {
	STATE.repositories = loadRepositories();
	clearCaches();
}

function main() {
	reloadRepositories();
	var selectedMenuIndex = 1; // default to Quit for fast pass-through
	var selectedRepoIndex = 0; // 0 = all repositories
	var menuCount = 2;

	while (bbs.online) {
		if (selectedRepoIndex > STATE.repositories.length) {
			selectedRepoIndex = STATE.repositories.length;
		}
		drawMainScreen(selectedMenuIndex, selectedRepoIndex);

		var key = console.getkey(K_NOCRLF | K_NOECHO | K_NOSPIN | K_UPPER);
		if (!key) {
			continue;
		}

		if (key === "Q" || key === KEY_ESC || key === "\x1b") {
			endCenteredViewport();
			break;
		}

		if (key === KEY_UP || key === "K") {
			selectedMenuIndex = (selectedMenuIndex - 1 + menuCount) % menuCount;
			continue;
		}
		if (key === KEY_DOWN || key === "J") {
			selectedMenuIndex = (selectedMenuIndex + 1) % menuCount;
			continue;
		}

		if (key === KEY_LEFT || key === "H") {
			var maxIndex = STATE.repositories.length;
			selectedRepoIndex = (selectedRepoIndex - 1 + (maxIndex + 1)) % (maxIndex + 1);
			continue;
		}
		if (key === KEY_RIGHT || key === "M") {
			var maxIdx = STATE.repositories.length;
			selectedRepoIndex = (selectedRepoIndex + 1) % (maxIdx + 1);
			continue;
		}

		if (key === "\r" || key === "\n") {
			if (selectedMenuIndex === 0) {
				endCenteredViewport();
				if (selectedRepoIndex <= 0) {
					showMessageBox("Change Log", "Select a specific project with LEFT/RIGHT first.", CLR.warn);
				} else {
					showCommitLogView(STATE.repositories[selectedRepoIndex - 1]);
				}
				continue;
			}
			if (selectedMenuIndex === 1) {
				endCenteredViewport();
				break;
			}
		}
	}

	endCenteredViewport();
}

main();
