# Security

## What this project can and cannot do on your machine

Histostick is a set of plain text files and one image. There is no installer and nothing runs by itself.

**No dependencies.** There is no `package.json`, no lock file and no `node_modules`. Nothing is downloaded when you
clone or copy the project, so there is no supply chain behind it to compromise.

**In the browser**, the page:

- loads scripts, styles, data and images only from its own folder (every address in the code is relative);
- makes no request to any other site, and has no analytics, trackers, fonts or frames from elsewhere;
- stores nothing: no cookies, no local storage;
- does not use `eval`, `new Function` or `document.write`, and every piece of text it inserts into the page is
  escaped first.

The only links that leave the folder are ordinary links a reader has to click: 4STREET's site, its email address and this project's source repository.

**The scripts** in `scripts/` are optional and use Node's built-in modules only:

- `serve.mjs` serves this folder to this machine alone (it listens on 127.0.0.1) and refuses any path outside the
  folder;
- `verify.mjs` reads the project's files and starts that same server briefly on a spare port to test it;
- `sync-meta.mjs` and `make-dummy.mjs` rewrite files inside this folder;
- `extract-nhanes.mjs` reads data files you point it at and writes one file inside this folder.

None of them runs another program, opens a connection to another machine, or reads your environment.

## Check it yourself

    node scripts/verify.mjs

Besides the chart's numbers, this fails if any file gains an address on another site, a non-relative import, a
package manifest, a call that could run code from text, browser storage, or a script that reaches beyond Node's
built-ins. It also checks that the one image is a real PNG.

Releases carry a `SHA256SUMS` file listing every file's checksum. To confirm a copy is unaltered:

    sha256sum -c SHA256SUMS

## Reporting a problem

Email contact@its4street.com with what you found and how to reproduce it. Please do not open a public issue for a
security problem before we have had the chance to respond.

The project is provided as is, with no warranty; see `LICENSE`.
