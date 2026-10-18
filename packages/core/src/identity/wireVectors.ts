// Test-only access to wire-vectors/wire-vectors.json, the server's wire-format
// vectors vendored byte-for-byte (scripts/sync-wire-vectors.mjs). The mirror
// tests compute every output from these inputs; no expected hex lives in them.
import doc from "../../../../wire-vectors/wire-vectors.json";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
const root = doc as unknown as {
  format: number;
  fixtures: Record<string, string>;
  vectors: Record<string, Record<string, Json> & { inputs: Record<string, Json> }>;
};
if (root.format !== 1) throw new Error("unknown wire-vectors.json format");

/** A string leaf, with `@name` replaced by the named fixture. */
function resolve(x: Json): string {
  if (typeof x !== "string") throw new Error(`not a string: ${JSON.stringify(x)}`);
  return x.startsWith("@") ? resolve(root.fixtures[x.slice(1)]) : x;
}

export function fixture(name: string): string {
  return resolve(`@${name}`);
}

export function vector(name: string) {
  const v = root.vectors[name];
  if (!v) throw new Error(`no vector ${name}`);
  const input = (k: string): Json => {
    if (!(k in v.inputs)) throw new Error(`vector ${name}: missing input ${k}`);
    return v.inputs[k];
  };
  return {
    /** A string input, fixture references resolved. */
    str: (k: string) => resolve(input(k)),
    num: (k: string) => input(k) as number,
    /** A list-of-strings input. */
    strs: (k: string) => (input(k) as Json[]).map(resolve),
    raw: input,
    /** An expected output, fixture references resolved. */
    out: (k: string) => resolve(v[k]),
  };
}
