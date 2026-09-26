//! Walking the hub's paged list endpoints.
//!
//! The hub's list dialect is an array plus `limit` and a keyset `cursor` on
//! the previous page's last row. Every caller here wants the whole list — an
//! admin table, a DM inbox, a pin panel — so a page is never the answer, and
//! stopping at the page size while saying nothing is the truncation the
//! pagination exists to avoid.
//!
//! Rows come back as `serde_json::Value` so one helper serves the endpoints
//! that hand the frontend raw JSON and the ones that deserialize into a typed
//! struct alike; the typed callers convert the assembled array at the end.

/// The hub clamps every one of these lists to 500.
pub(crate) const LIST_PAGE_SIZE: usize = 500;

// ponytail: bounded so a server that stops advancing the cursor cannot spin
// here. The keyset comparison is strict, so it cannot legitimately repeat a
// row.
pub(crate) const LIST_MAX_PAGES: usize = 40;

/// GET `url`, following the cursor until a short page comes back.
///
/// `cursor_field` is the field the endpoint's keyset is built on — the value
/// carried by the last row of a page and sent back as the next `cursor`.
pub(crate) async fn fetch_all_pages(
    client: &reqwest::Client,
    token: &str,
    url: &str,
    cursor_field: &str,
    label: &str,
) -> Result<Vec<serde_json::Value>, String> {
    let mut all: Vec<serde_json::Value> = Vec::new();
    let mut cursor: Option<String> = None;

    for _ in 0..LIST_MAX_PAGES {
        let mut req = client
            .get(url)
            .bearer_auth(token)
            .query(&[("limit", LIST_PAGE_SIZE.to_string())]);
        if let Some(c) = &cursor {
            req = req.query(&[("cursor", c.as_str())]);
        }
        let resp = req.send().await.map_err(|e| format!("Failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(resp.text().await.unwrap_or_default());
        }
        let page: Vec<serde_json::Value> =
            resp.json().await.map_err(|e| format!("Invalid: {e}"))?;

        let next = page
            .last()
            .and_then(|row| row.get(cursor_field))
            .and_then(|v| v.as_str())
            .map(str::to_string);

        // Stall guard: a hub honouring the cursor can never end a page on the
        // value we just sent, so one that does is ignoring it — every further
        // page would be this same one.
        if next.is_some() && next == cursor {
            eprintln!("{label}: hub is not advancing the cursor — stopping");
            return Ok(all);
        }

        let short = page.len() < LIST_PAGE_SIZE;
        all.extend(page);
        cursor = next;
        if short || cursor.is_none() {
            return Ok(all);
        }
    }

    eprintln!(
        "{label}: stopped at {LIST_MAX_PAGES} pages ({} rows)",
        all.len()
    );
    Ok(all)
}

/// `fetch_all_pages`, deserialized into the caller's row type.
pub(crate) async fn fetch_all_pages_as<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    token: &str,
    url: &str,
    cursor_field: &str,
    label: &str,
) -> Result<Vec<T>, String> {
    let rows = fetch_all_pages(client, token, url, cursor_field, label).await?;
    serde_json::from_value(serde_json::Value::Array(rows)).map_err(|e| format!("Invalid: {e}"))
}
