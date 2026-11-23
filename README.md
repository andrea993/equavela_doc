# Equavela manual

The user manual of Equavela as a static HTML site. The application repository includes this repository as a submodule at `private/docs/manual` and serves `site/manual` at `/manual/`.

- `pages/*.html`: guide chapters. The first line is `<!-- title: ... -->`; the number in the file name sets the order.
- `functions.tsv`: one row per built-in function: name, Julia counterpart (`;` between several), notes (HTML). The names, signatures, categories and summaries come from the application's catalogue, `docs/spec/fixtures/builtin-catalogue.tsv`.
- `assets/`: stylesheet, search script and logos.
- `site/manual/`: the built site, committed so that it can be browsed and bundled without a build step.

Build from the application repository root:

```bash
node private/docs/manual/build.mjs
node private/docs/manual/build.mjs --check
```

Open `site/manual/index.html` in a browser to read it.

## Screenshots

Screenshots in the manual must come from the Equavela desktop application, not from a
browser-only preview: the native window, ribbon, panels and platform styling are part of
what the screenshots document. To capture or refresh one locally, start the desktop
preview with `pnpm --dir app tauri dev`, exercise the feature in the running window, and
save the image under `assets/screenshots/` using a descriptive, lower-case name. Keep
the worksheet small and use only Equavela UI and sample data; do not include personal
paths or unrelated desktop content. Reference the image from the relevant chapter with
a relative path (for example `assets/screenshots/projects-window.png`) and add a
short alt text explaining the workflow shown. A browser preview at `http://127.0.0.1`
is useful for checking layout, but should not be committed as a desktop screenshot.

## Publishing

The site is plain static HTML, CSS and JavaScript with relative links, so it works from the file system, inside the application and on GitHub Pages. Keep it that way: no server-side features, no build step on the host, no absolute paths, and no data loaded with `fetch` (the search index is a script). `site/` is the folder to publish; it holds `.nojekyll` so Pages serves it unprocessed, and `site/index.html` leads to the manual.
