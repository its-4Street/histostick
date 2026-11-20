# Contributing

Thank you for looking. A few things keep this project what it is.

## The rules

1. **No packages.** No `package.json`, no bundler, no framework, no script or font loaded from another site. If a
   change needs a dependency, it does not belong here.
2. **The chart is two files.** `src/histostick.js` and `src/histostick.css` must keep working when copied out on
   their own. The demonstration page (`index.html`, `src/page.js`, `src/style.css`) may depend on the chart, never
   the other way round.
3. **Escape what you insert.** Any text that reaches the page goes through `esc()` first.
4. **Say what the data is.** Demonstration data must name its source, and anything invented must be marked
   fictional on the page and in `codemeta.json`.

## Before you send a change

    node scripts/verify.mjs

Every check must pass. If you change `codemeta.json`, run `node scripts/sync-meta.mjs` so the page's structured data
matches. If you change the page, the chart, the styles or the data, run `node scripts/build-standalone.mjs` so
`standalone.html` (the zero-dependency one-file page) matches. Add a line to `CHANGELOG.md`.

## Licence of contributions

By contributing you agree that your contribution is offered under the project's MIT licence.
