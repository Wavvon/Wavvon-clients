// Fails if wire-vectors/wire-vectors.json differs from the server's file at the
// commit recorded in wire-vectors/SOURCE. Re-sync with sync-wire-vectors.mjs.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "wire-vectors");
const sha = readFileSync(join(DIR, "SOURCE"), "utf8").trim();
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`wire-vectors/SOURCE is not a commit sha: ${sha}`);

const url = `https://raw.githubusercontent.com/Wavvon/Wavvon-server/${sha}/crates/identity/wire-vectors.json`;
const res = await fetch(url);
if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
const upstream = Buffer.from(await res.arrayBuffer());
const local = readFileSync(join(DIR, "wire-vectors.json"));

if (!upstream.equals(local)) {
  console.error(`wire-vectors/wire-vectors.json differs from Wavvon-server @ ${sha}.`);
  console.error("Do not edit it by hand: run node scripts/sync-wire-vectors.mjs [ref].");
  process.exit(1);
}
console.log(`wire-vectors.json matches Wavvon-server @ ${sha}`);
