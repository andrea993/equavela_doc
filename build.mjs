// Builds the Equavela user manual into site/manual: a static HTML site that the app serves at
// /manual/ and that also opens straight from the file system.
//
//   node build.mjs [--app <application root>] [--check]
//
// Sources:
//   pages/*.html       guide chapters; the first line is `<!-- title: ... -->`, the file name's
//                      number gives the order
//   functions.tsv      per function: Julia counterpart and notes (HTML allowed)
//   special-forms.tsv  functions the engine handles as special forms
//   assets/*           stylesheet, script and logos, copied as they are
//   the application    kept by the application repository, whose submodule this repository is
//                      (at docs/manual; `--app <root>` names another checkout):
//                      core/fixtures/builtin-catalogue.tsv       every built-in function
//                      app/src/keymap/*.json                     the keyboard table
//                      app/src/catalog/commands.ts               the command titles
//                      app/src/catalog/units.ts, kernel/*/src/units.tsv   the units
//
// `--check` fails when a catalogued function has no row in functions.tsv or the built site
// differs from the sources.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(SRC, "site");
const OUT = path.join(SITE, "manual");
const check = process.argv.includes("--check");
const appAt = process.argv.indexOf("--app");
// The application repository, whose submodule this repository is at docs/manual.
const APP = appAt > 0 ? path.resolve(process.argv[appAt + 1]) : path.join(SRC, "../..");
const CATALOGUE = path.join(APP, "core/fixtures/builtin-catalogue.tsv");

const read = (file) => fs.readFileSync(file, "utf8");
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (text) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const stripTags = (html) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

// Function anchors: names may hold Greek letters and underscores, so they are encoded.
const anchor = (name) => "f-" + [...name].map((c) => (/[A-Za-z0-9]/.test(c) ? c : `_${c.codePointAt(0).toString(16)}`)).join("");

// ---- Guide pages ---------------------------------------------------------------------------
const pages = fs
  .readdirSync(path.join(SRC, "pages"))
  .filter((file) => file.endsWith(".html"))
  .sort()
  .map((file) => {
    const html = read(path.join(SRC, "pages", file));
    const title = /<!--\s*title:\s*(.*?)\s*-->/.exec(html)?.[1];
    if (!title) throw new Error(`${file}: missing <!-- title: ... -->`);
    const name = file.replace(/^\d+-/, "").replace(/\.html$/, "");
    return { file: name === "index" ? "index.html" : `${name}.html`, title, html };
  });

// ---- Functions -----------------------------------------------------------------------------
const catalogue = read(CATALOGUE)
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const [name, signature, category, summary] = line.split("\t");
    return { name, signature, category, summary };
  });
// Special forms of the calculation engine (root, the solve-block functions) are not in the
// application's catalogue; this repository lists them.
for (const line of read(path.join(SRC, "special-forms.tsv")).split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const [name, signature, category, summary] = line.split("\t");
  if (!catalogue.some((entry) => entry.name === name)) catalogue.push({ name, signature, category, summary });
}
const notes = new Map();
for (const line of read(path.join(SRC, "functions.tsv")).split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const [name, julia = "", detail = ""] = line.split("\t");
  notes.set(name, { julia, detail });
}
const missing = catalogue.filter((entry) => !notes.has(entry.name)).map((entry) => entry.name);
const unknown = [...notes.keys()].filter((name) => !catalogue.some((entry) => entry.name === name));
if (unknown.length) throw new Error(`functions.tsv names not in the catalogue: ${unknown.join(", ")}`);

const categories = [...new Set(catalogue.map((entry) => entry.category))].sort((a, b) => a.localeCompare(b));
const categoryFile = (category) => `functions/${slug(category)}.html`;

// ---- Keyboard and commands (generated from the application's tables) -----------------------
const commandsSource = read(path.join(APP, "app/src/catalog/commands.ts"));
// Command identifiers include ordinary command names as well as Unicode symbol IDs
// (for example ς and ϕ). Keep the parser independent of the identifier alphabet so a
// renamed or newly added symbol command does not silently disappear from the manual.
const titles = new Map([...commandsSource.matchAll(/^\s*\["([^"]+)", "([^"]+)", "([^"]*)"\],?$/gm)].map((m) => [m[1], { title: m[2], keywords: m[3] }]));
const spelled = (cmd) => {
  const words = cmd.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const keymap = (name) => JSON.parse(read(path.join(APP, `app/src/keymap/${name}.json`)));
const common = keymap("common");
const shortcuts = keymap("shortcuts");
const named = (key) => `${key.ctrl ? "Ctrl+" : ""}${key.alt ? "Alt+" : ""}${key.shift ? "Shift+" : ""}${key.key === " " ? "Space" : key.key.replace(/^Arrow/, "")}`;
const CONTEXTS = {
  global: "Anywhere",
  sheet: "On the worksheet (no region being edited)",
  math: "In a math region",
  matrix: "In a matrix",
  program: "In a program",
  string: "In a string",
  text: "In a text region",
};
const bindings = new Map();
const bind = (ctx, cmd, keys) => {
  const id = `${ctx}\u0000${cmd}`;
  if (!bindings.has(id)) bindings.set(id, { ctx, cmd, keys: [] });
  const row = bindings.get(id);
  if (!row.keys.includes(keys)) row.keys.push(keys);
};
for (const chord of shortcuts.ctrl) bind(chord.ctx, chord.cmd, chord.label);
for (const key of common.keys) bind(key.ctx, key.cmd, named(key));
for (const [ch, cmd] of Object.entries(common.chars)) bind("math", cmd, ch);
const keyCell = (keys) => (keys.length ? keys.map((k) => k.split(/(?<=.)\+(?=.)/).map((part) => `<kbd>${escape(part)}</kbd>`).join("+")).join(" or ") : "—");
const keyboardBody = `<h1>Keyboard shortcuts</h1>
<p>Equavela has one table of shortcuts for every keyboard layout. A shortcut is a character: <kbd>Ctrl</kbd>+<kbd>[</kbd> is <kbd>Ctrl</kbd> and the character <kbd>[</kbd>, typed with the keys your layout uses for it. On the Italian layout it is <kbd>Ctrl</kbd>+<kbd>AltGr</kbd>+<kbd>è</kbd>, and <kbd>Ctrl</kbd>+<kbd>=</kbd> is <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>0</kbd>. A layout without the character has no shortcut for it: run the command from the ribbon or the <strong>Commands</strong> palette (<kbd>Ctrl</kbd>+<kbd>K</kbd>), which shows the shortcuts next to each command. <em>Help › Keyboard shortcuts</em> prints them.</p>
${Object.entries(CONTEXTS)
  .map(([ctx, label]) => {
    const rows = [...bindings.values()].filter((row) => row.ctx === ctx);
    if (!rows.length) return "";
    rows.sort((a, b) => (titles.get(a.cmd)?.title ?? spelled(a.cmd)).localeCompare(titles.get(b.cmd)?.title ?? spelled(b.cmd)));
    return `<h2 id="keys-${ctx}">${escape(label)}</h2>
<table><thead><tr><th>Command</th><th>Keys</th></tr></thead><tbody>
${rows.map((row) => `<tr><td>${escape(titles.get(row.cmd)?.title ?? spelled(row.cmd))}</td><td>${keyCell(row.keys)}</td></tr>`).join("\n")}
</tbody></table>`;
  })
  .join("\n")}`;
const commandRows = [...titles].filter(([, entry]) => entry.keywords);
const commandsBody = `<h1>Command reference</h1>
<p>Every command of the ribbon and the menus can also be run from the <strong>Commands</strong> palette (<kbd>Ctrl</kbd>+<kbd>K</kbd>): type a few letters of its name or of a related word. This list is generated from the palette's catalogue.</p>
<table><thead><tr><th>Command</th><th>Found by</th></tr></thead><tbody>
${commandRows
  .sort((a, b) => a[1].title.localeCompare(b[1].title))
  .map(([, entry]) => `<tr><td>${escape(entry.title)}</td><td>${escape(entry.keywords)}</td></tr>`)
  .join("\n")}
</tbody></table>`;
const unitGroups = new Map([...read(path.join(APP, "app/src/catalog/units.ts")).matchAll(/\["([-0-9,]+)", "([^"]+)"\]/g)].map((m) => [m[1], m[2]]));
const runtimeDir = fs.readdirSync(path.join(APP, "kernel")).find((dir) => fs.existsSync(path.join(APP, "kernel", dir, "src/units.tsv")));
const unitRows = [];
const unitPrefixes = [];
for (const line of read(path.join(APP, "kernel", runtimeDir, "src/units.tsv")).split(/\r?\n/)) {
  const text = line.trim();
  if (!text || text.startsWith("#")) continue;
  const [name, dimension, flag, ...definition] = text.split(/\s+/);
  if (name === "@prefix") unitPrefixes.push(`${dimension} (10^${flag})`);
  else unitRows.push({ name, dimension, prefixed: flag === "p", definition: definition.join(" ").replace(/\s+#.*$/, "") });
}
const groupOrder = [...unitGroups.keys()];
const byGroup = new Map();
for (const row of unitRows) {
  const key = unitGroups.has(row.dimension) ? row.dimension : "other";
  if (!byGroup.has(key)) byGroup.set(key, []);
  byGroup.get(key).push(row);
}
const unitsBody = `<h1>Units reference</h1>
<p>Every unit Equavela knows, grouped by dimension. Names are case sensitive. A unit marked <em>prefixes</em> also exists with every SI prefix: ${unitPrefixes.map((p) => `<code>${escape(p)}</code>`).join(", ")}, so <code>km</code>, <code>kN</code>, <code>MPa</code> and <code>μs</code> are units. This page is generated from the unit table of the calculation engine. How to use units is explained in <a href="units.html">Units</a>.</p>
${[...groupOrder, "other"]
  .filter((key) => byGroup.has(key))
  .map(
    (key) => `<h2 id="units-${slug(unitGroups.get(key) ?? "other")}">${escape(unitGroups.get(key) ?? "Other")}</h2>
<table><thead><tr><th>Unit</th><th>Equals</th><th>Prefixes</th></tr></thead><tbody>
${byGroup
  .get(key)
  .map((row) => `<tr><td><code>${escape(row.name)}</code></td><td><code>${escape(row.definition)}</code></td><td>${row.prefixed ? "yes" : ""}</td></tr>`)
  .join("\n")}
</tbody></table>`,
  )
  .join("\n")}`;
const generated = [
  { file: "units-reference.html", title: "Units reference", html: unitsBody },
  { file: "keyboard.html", title: "Keyboard shortcuts", html: keyboardBody },
  { file: "commands.html", title: "Command reference", html: commandsBody },
];

// ---- Layout --------------------------------------------------------------------------------
function layout({ title, body, depth, current }) {
  const up = depth ? "../" : "";
  const guide = pages
    .map((page) => `<li><a href="${up}${page.file}"${page.file === current ? ' aria-current="page"' : ""}>${escape(page.title)}</a></li>`)
    .join("\n");
  const reference = generated
    .map((page) => `<li><a href="${up}${page.file}"${page.file === current ? ' aria-current="page"' : ""}>${escape(page.title)}</a></li>`)
    .join("\n");
  const functions = categories
    .map((category) => {
      const file = categoryFile(category);
      return `<li><a href="${up}${file}"${file === current ? ' aria-current="page"' : ""}>${escape(category)}</a></li>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Equavela manual</title>
<link rel="icon" href="${up}assets/equavela-mark.svg">
<link rel="stylesheet" href="${up}assets/manual.css">
</head>
<body>
<header class="top">
  <a class="brand" href="${up}index.html"><img src="${up}assets/equavela-mark.svg" alt=""><span>Equavela</span><small>Manual</small></a>
  <div class="search"><input id="search" type="search" placeholder="Search the manual (functions, commands, keys)" aria-label="Search the manual" autocomplete="off"><ol id="results" hidden></ol></div>
  <a class="site" href="https://equavela.org/">equavela.org <span aria-hidden="true">↗</span></a>
  <button class="menu" aria-label="Contents" aria-controls="nav">☰</button>
</header>
<div class="frame">
<nav id="nav">
<h2>Guide</h2>
<ul>
${guide}
</ul>
<h2>Reference</h2>
<ul>
${reference}
</ul>
<h2><a href="${up}functions/index.html">Functions</a></h2>
<ul>
${functions}
</ul>
<p class="site-nav"><a href="https://equavela.org/">equavela.org <span aria-hidden="true">↗</span></a></p>
</nav>
<main>
${body}
</main>
</div>
<script>window.MANUAL_ROOT = ${JSON.stringify(up)};</script>
<script src="${up}assets/search-index.js"></script>
<script src="${up}assets/manual.js"></script>
</body>
</html>
`;
}

// ---- Build ---------------------------------------------------------------------------------
const files = new Map();
const index = [];

for (const page of pages) {
  files.set(page.file, layout({ title: page.title, body: page.html.replace(/<!--\s*title:.*?-->\s*/, ""), depth: 0, current: page.file }));
  index.push({ t: page.title, u: page.file, k: "Guide", x: stripTags(page.html).slice(0, 4000) });
  for (const match of page.html.matchAll(/<h([23]) id="([^"]+)">(.*?)<\/h\1>/g)) {
    index.push({ t: stripTags(match[3]), u: `${page.file}#${match[2]}`, k: page.title, x: "" });
  }
}

for (const page of generated) {
  files.set(page.file, layout({ title: page.title, body: page.html, depth: 0, current: page.file }));
  index.push({ t: page.title, u: page.file, k: "Reference", x: stripTags(page.html).slice(0, 4000) });
}
for (const [cmd, entry] of titles) {
  if (entry.keywords) index.push({ t: entry.title, u: "commands.html", k: "Command", x: entry.keywords + " " + cmd });
}

function functionEntry(entry) {
  const note = notes.get(entry.name) ?? { julia: "", detail: "" };
  const julia = note.julia
    ? `<dt>Julia</dt><dd>${note.julia
        .split(/\s*;\s*/)
        .map((item) => `<code>${escape(item)}</code>`)
        .join(", ")}</dd>`
    : "";
  const detail = note.detail ? `<dt>Notes</dt><dd>${note.detail}</dd>` : "";
  return `<section class="function" id="${anchor(entry.name)}">
<h3><code>${escape(entry.name)}</code></h3>
<p class="signature"><code>${escape(entry.signature)}</code></p>
<p>${escape(entry.summary)}</p>
<dl>${julia}${detail}</dl>
</section>`;
}

for (const category of categories) {
  const entries = catalogue.filter((entry) => entry.category === category).sort((a, b) => a.name.localeCompare(b.name, "en"));
  const toc = entries.map((entry) => `<a href="#${anchor(entry.name)}"><code>${escape(entry.name)}</code></a>`).join(" ");
  const body = `<p class="crumbs"><a href="index.html">Functions</a></p>
<h1>${escape(category)}</h1>
<p class="toc">${toc}</p>
${entries.map(functionEntry).join("\n")}`;
  files.set(categoryFile(category), layout({ title: category, body, depth: 1, current: categoryFile(category) }));
  for (const entry of entries) {
    const note = notes.get(entry.name);
    index.push({ t: entry.name, u: `${categoryFile(category)}#${anchor(entry.name)}`, k: category, x: `${entry.signature} ${entry.summary} ${note?.julia ?? ""}` });
  }
}

const all = [...catalogue].sort((a, b) => a.name.localeCompare(b.name, "en"));
const letters = new Map();
for (const entry of all) {
  const letter = /[A-Za-z]/.test(entry.name[0]) ? entry.name[0].toUpperCase() : "Greek and symbols";
  if (!letters.has(letter)) letters.set(letter, []);
  letters.get(letter).push(entry);
}
const functionsIndex = `<h1>Functions</h1>
<p>Equavela has ${catalogue.length} built-in functions. Each entry gives the call, what it returns, the Julia function or package that computes it and, where Equavela differs from that Julia function, how. Built-in names are case sensitive. Functions of any Julia package can also be called directly; see <a href="../julia.html">Julia in worksheets</a>.</p>
<h2 id="by-category">By category</h2>
<ul class="columns">
${categories.map((category) => `<li><a href="${slug(category)}.html">${escape(category)}</a> <span class="count">${catalogue.filter((entry) => entry.category === category).length}</span></li>`).join("\n")}
</ul>
<h2 id="a-z">A to Z</h2>
${[...letters]
  .map(
    ([letter, entries]) =>
      `<h3>${escape(letter)}</h3><p class="toc">${entries.map((entry) => `<a href="${slug(entry.category)}.html#${anchor(entry.name)}"><code>${escape(entry.name)}</code></a>`).join(" ")}</p>`,
  )
  .join("\n")}`;
files.set("functions/index.html", layout({ title: "Functions", body: functionsIndex, depth: 1, current: "functions/index.html" }));

files.set("assets/search-index.js", `window.MANUAL_INDEX = ${JSON.stringify(index)};\n`);
function copyAssets(relative) {
  for (const entry of fs.readdirSync(path.join(SRC, relative), { withFileTypes: true })) {
    const file = `${relative}/${entry.name}`;
    if (entry.isDirectory()) copyAssets(file);
    else if (entry.isFile()) files.set(file, fs.readFileSync(path.join(SRC, file)));
  }
}
copyAssets("assets");

// ---- Internal links: every relative link names a page of the site and an id on it ----------
const broken = [];
for (const [file, text] of files) {
  if (!file.endsWith(".html")) continue;
  for (const match of text.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = match[1];
    if (/^(https?:|mailto:|#$)/.test(href) || href.startsWith("${")) continue;
    const [target, hash] = href.split("#");
    const resolved = target ? path.posix.normalize(path.posix.join(path.posix.dirname(file), target)) : file;
    const page = files.get(resolved);
    if (page === undefined) broken.push(`${file}: ${href}`);
    else if (hash && !page.includes(`id="${hash}"`)) broken.push(`${file}: ${href} (no such anchor)`);
  }
}
if (broken.length) {
  console.error(`broken links:\n  ${broken.join("\n  ")}`);
  process.exit(1);
}

// ---- Write or check ------------------------------------------------------------------------
if (check) {
  const stale = [...files].filter(([file, contents]) => {
    const output = path.join(OUT, file);
    return !fs.existsSync(output) || !fs.readFileSync(output).equals(Buffer.from(contents));
  }).map(([file]) => file);
  const problems = [];
  if (missing.length) problems.push(`functions without a row in functions.tsv: ${missing.join(", ")}`);
  if (stale.length) problems.push(`stale files in site/manual (run node build.mjs): ${stale.join(", ")}`);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`manual up to date: ${files.size} files`);
} else {
  fs.rmSync(OUT, { recursive: true, force: true });
  // GitHub Pages serves site/ as it is: no Jekyll processing, and the root leads to the manual.
  fs.writeFileSync(path.join(SITE, ".nojekyll"), "");
  fs.writeFileSync(
    path.join(SITE, "index.html"),
    '<!doctype html>\n<meta charset="utf-8">\n<title>Equavela manual</title>\n<meta http-equiv="refresh" content="0; url=manual/index.html">\n<a href="manual/index.html">Equavela manual</a>\n',
  );
  for (const [file, text] of files) {
    fs.mkdirSync(path.dirname(path.join(OUT, file)), { recursive: true });
    fs.writeFileSync(path.join(OUT, file), text);
  }
  console.log(`manual: ${files.size} files in site/manual${missing.length ? `; ${missing.length} functions still without notes` : ""}`);
}
