// Vendors the server's wire-format test vectors (the single authority) into
// wire-vectors/, byte for byte, and records the commit they came from.
//
//   node scripts/sync-wire-vectors.mjs [ref]     (default ref: develop)
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "wire-vectors");
const ref = process.argv[2] ?? "develop";

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "wavvon-clients-sync" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

// Resolve first, then download at the sha, so SOURCE names exactly the bytes written.
const { sha } = await (await get(`https://api.github.com/repos/Wavvon/Wavvon-server/commits/${ref}`)).json();
const body = Buffer.from(
  await (await get(`https://raw.githubusercontent.com/Wavvon/Wavvon-server/${sha}/crates/identity/wire-vectors.json`)).arrayBuffer(),
);
if (JSON.parse(body.toString("utf8")).format !== 1) throw new Error("unknown wire-vectors.json format");

writeFileSync(join(DIR, "wire-vectors.json"), body);
writeFileSync(join(DIR, "SOURCE"), `${sha}\n`);
console.log(`wire-vectors.json synced from Wavvon-server ${ref} @ ${sha}`);
