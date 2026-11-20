#!/usr/bin/env node
// Local static server for the project folder. Node built-ins only, bound to this machine.
//   node scripts/serve.mjs [port]      (default 4173)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", "": "text/plain; charset=utf-8" };

// the only extensionless file served is the licence
const BARE = new Set(["LICENSE"]);

export function start(port = 4173) {
  const server = createServer(async (req, res) => {
    let path;
    try {
      path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      return res.writeHead(400).end("Bad request");   // a malformed percent escape must not take the server down
    }
    const file = resolve(root, "." + (path.endsWith("/") ? path + "index.html" : path));
    const type = TYPES[extname(file)];
    const bare = extname(file) === "" && !BARE.has(file.slice(root.length + 1));
    if (!type || bare || !(file + sep).startsWith(root + sep)) return res.writeHead(404).end("Not found");
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await start(Number(process.argv[2] ?? 4173));
  console.log(`http://127.0.0.1:${server.address().port}/`);
}
