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

/// GET `url` with `query`, following the cursor until a short page comes back.
///
/// `cursor_of` gives the keyset value a row carries — the last row's value is
/// sent back as the next `cursor`. A row without one ends the walk.
///
/// A hub that predates the paging ignores `limit` and `cursor` and answers
/// with its whole list; the next request then ends on the cursor just sent,
/// which the stall guard reads as "not advancing" and stops on, so no row is
/// counted twice.
pub(crate) async fn walk_pages<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    token: &str,
    url: &str,
    query: &[(&str, String)],
    cursor_of: impl Fn(&T) -> Option<String>,
    label: &str,
) -> Result<Vec<T>, String> {
    let mut all: Vec<T> = Vec::new();
    let mut cursor: Option<String> = None;

    for _ in 0..LIST_MAX_PAGES {
        let mut req = client
            .get(url)
            .bearer_auth(token)
            .query(query)
            .query(&[("limit", LIST_PAGE_SIZE.to_string())]);
        if let Some(c) = &cursor {
            req = req.query(&[("cursor", c.as_str())]);
        }
        let resp = req.send().await.map_err(|e| format!("Failed: {e}"))?;
        if !resp.status().is_success() {
            return Err(resp.text().await.unwrap_or_default());
        }
        let page: Vec<T> = resp.json().await.map_err(|e| format!("Invalid: {e}"))?;

        let next = page.last().and_then(&cursor_of);

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

/// `walk_pages` over raw JSON rows, keyed on the string field `cursor_field`.
pub(crate) async fn fetch_all_pages(
    client: &reqwest::Client,
    token: &str,
    url: &str,
    cursor_field: &str,
    label: &str,
) -> Result<Vec<serde_json::Value>, String> {
    walk_pages(
        client,
        token,
        url,
        &[],
        |row: &serde_json::Value| row.get(cursor_field)?.as_str().map(str::to_string),
        label,
    )
    .await
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
