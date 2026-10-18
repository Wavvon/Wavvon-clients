//! Test-only access to `wire-vectors/wire-vectors.json` at the repo root: the
//! server's wire-format vectors, vendored byte-for-byte by
//! `scripts/sync-wire-vectors.mjs`. Mirror tests compute every output from
//! these inputs; no expected hex lives in them.
use serde_json::Value;
use std::sync::OnceLock;

fn doc() -> &'static Value {
    static DOC: OnceLock<Value> = OnceLock::new();
    DOC.get_or_init(|| {
        let v: Value =
            serde_json::from_str(include_str!("../../../../wire-vectors/wire-vectors.json"))
                .unwrap();
        assert_eq!(v["format"], 1, "unknown wire-vectors.json format");
        v
    })
}

/// A string leaf, with `@name` replaced by the named fixture.
pub fn r(v: &Value) -> String {
    let s = v.as_str().unwrap_or_else(|| panic!("not a string: {v}"));
    match s.strip_prefix('@') {
        Some(name) => r(&doc()["fixtures"][name]),
        None => s.to_string(),
    }
}

pub fn fixture(name: &str) -> String {
    r(&doc()["fixtures"][name])
}

pub fn vector(name: &str) -> &'static Value {
    let v = &doc()["vectors"][name];
    assert!(!v.is_null(), "no vector {name}");
    v
}

pub fn inp<'a>(v: &'a Value, key: &str) -> &'a Value {
    let obj = v["inputs"].as_object().unwrap();
    obj.get(key)
        .unwrap_or_else(|| panic!("missing input {key}"))
}

/// A string input, fixture references resolved.
pub fn s(v: &Value, key: &str) -> String {
    r(inp(v, key))
}

pub fn n(v: &Value, key: &str) -> u64 {
    inp(v, key).as_u64().unwrap()
}

pub fn strings(v: &Value, key: &str) -> Vec<String> {
    inp(v, key).as_array().unwrap().iter().map(r).collect()
}

/// An expected output, fixture references resolved.
pub fn out(v: &Value, key: &str) -> String {
    r(&v[key])
}

pub fn arr<const N: usize>(hex_str: &str) -> [u8; N] {
    hex::decode(hex_str).unwrap().try_into().unwrap()
}
