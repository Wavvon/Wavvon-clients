//! The request shape most hub commands share: send, refuse a non-2xx with the
//! hub's own body as the error, then read the answer.

/// Sends `req`; a transport failure or a non-2xx status becomes the error,
/// the latter carrying the response body the hub explained itself in.
pub(crate) async fn send_ok(req: reqwest::RequestBuilder) -> Result<reqwest::Response, String> {
    let resp = req.send().await.map_err(|e| format!("Failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(resp)
}

/// `send_ok`, then the body deserialized as `T`.
pub(crate) async fn send_json<T: serde::de::DeserializeOwned>(
    req: reqwest::RequestBuilder,
) -> Result<T, String> {
    send_ok(req)
        .await?
        .json()
        .await
        .map_err(|e| format!("Invalid: {e}"))
}
