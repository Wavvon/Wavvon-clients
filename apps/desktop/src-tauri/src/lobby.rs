use crate::state::AppState;
use tauri::State;

// =============================================================================
// Security Level Lobby
// =============================================================================

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct LobbyStatusResult {
    pub status: String,
    pub required_level: u32,
    pub current_level: u32,
    pub entered_at: Option<i64>,
    pub welcome_md: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct LobbySubmitResult {
    pub promoted: bool,
    pub new_level: u32,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct LobbyWelcome {
    pub welcome_md: String,
    pub hub_name: String,
    pub required_level: u32,
}

#[tauri::command]
pub(crate) async fn lobby_status(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<LobbyStatusResult, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/lobby/status"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
pub(crate) async fn lobby_submit_proof(
    hub_url: String,
    pow_proof: String,
    state: State<'_, AppState>,
) -> Result<LobbySubmitResult, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/lobby/submit-pow"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "pow_proof": pow_proof }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
pub(crate) async fn lobby_get_welcome(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<LobbyWelcome, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/lobby/welcome"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
pub(crate) async fn set_lobby_settings(
    hub_url: String,
    lobby_enabled: bool,
    welcome_md: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .patch(format!("{base}/admin/settings/lobby"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "lobby_enabled": lobby_enabled, "welcome_md": welcome_md }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

// =============================================================================
// Admission challenge
// =============================================================================

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct ChallengePrompt {
    pub id: String,
    pub mode: String,
    pub prompt_svg: Option<String>,
    pub expires_at: i64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct ChallengeResult {
    pub ok: bool,
    pub token: Option<String>,
    pub expires_at: Option<i64>,
    pub next_challenge: Option<ChallengePrompt>,
    pub attempts_remaining: Option<u32>,
}

#[tauri::command]
pub(crate) async fn challenge_fetch(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<ChallengePrompt, String> {
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/challenge/new"))
        .query(&[("pubkey", &pubkey)])
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
pub(crate) async fn challenge_submit(
    hub_url: String,
    id: String,
    pubkey: String,
    answer: Option<String>,
    state: State<'_, AppState>,
) -> Result<ChallengeResult, String> {
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/challenge/verify"))
        .json(&serde_json::json!({ "id": id, "pubkey": pubkey, "answer": answer }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
pub(crate) async fn set_challenge_settings(
    hub_url: String,
    challenge_mode: String,
    challenge_difficulty: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .patch(format!("{base}/admin/settings/challenge"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "challenge_mode": challenge_mode,
            "challenge_difficulty": challenge_difficulty,
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

// =============================================================================
// Role Questionnaire / Onboarding Survey
// =============================================================================

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct SurveyChoiceTs {
    pub id: String,
    pub label: String,
    pub display_order: i64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct SurveyQuestionTs {
    pub id: String,
    pub prompt: String,
    pub kind: String,
    pub required: bool,
    pub display_order: i64,
    // Join-form fields (join-forms.md). Carried through rather than dropped,
    // or an admin save from this client would erase them.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub help: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiline: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_len: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_choices: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_choices: Option<i32>,
    pub choices: Option<Vec<SurveyChoiceTs>>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct SurveyPublicTs {
    pub id: String,
    pub questions: Vec<SurveyQuestionTs>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct SurveyChoiceAdminTs {
    pub id: String,
    pub label: String,
    pub display_order: i64,
    pub role_ids: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct SurveyQuestionAdminTs {
    pub id: String,
    pub prompt: String,
    pub kind: String,
    pub required: bool,
    pub display_order: i64,
    // Join-form fields (join-forms.md). Carried through rather than dropped,
    // or an admin save from this client would erase them.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub help: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiline: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_len: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_choices: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_choices: Option<i32>,
    pub choices: Option<Vec<SurveyChoiceAdminTs>>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct SurveyAdminTs {
    pub id: String,
    pub enabled: bool,
    pub questions: Vec<SurveyQuestionAdminTs>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct SurveyAnswer {
    pub question_id: String,
    pub choice_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub choice_ids: Option<Vec<String>>,
    pub text_answer: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checked: Option<bool>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct SurveySubmitResult {
    pub next_state: String,
    pub applied_roles: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct SurveyAnswerView {
    pub question_id: String,
    pub prompt: String,
    pub choice_label: Option<String>,
    pub text_answer: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checked: Option<bool>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct SurveyResponseAdminTs {
    pub response_id: String,
    pub pubkey: String,
    pub display_name: Option<String>,
    pub submitted_at: i64,
    pub answers: Vec<SurveyAnswerView>,
}

#[tauri::command]
pub(crate) async fn survey_current(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Option<SurveyPublicTs>, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/survey/current"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
pub(crate) async fn survey_submit(
    hub_url: String,
    survey_id: String,
    answers: Vec<SurveyAnswer>,
    state: State<'_, AppState>,
) -> Result<SurveySubmitResult, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/survey/submit"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "survey_id": survey_id, "answers": answers }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

/// The hub's join application (join-forms.md), for a joiner it holds pending.
#[tauri::command]
pub(crate) async fn application_form(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Option<SurveyPublicTs>, String> {
    application_get(&state, &hub_url, "application").await
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub(crate) struct ApplicationStatusTs {
    pub state: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retry_after: Option<i64>,
}

#[tauri::command]
pub(crate) async fn application_status(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<ApplicationStatusTs, String> {
    application_get(&state, &hub_url, "application/status").await
}

async fn application_get<T: serde::de::DeserializeOwned>(
    state: &AppState,
    hub_url: &str,
    path: &str,
) -> Result<T, String> {
    let token = crate::state::session_for_url(state, hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/{path}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
pub(crate) async fn application_submit(
    hub_url: String,
    survey_id: String,
    answers: Vec<SurveyAnswer>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .post(format!("{base}/application"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "survey_id": survey_id, "answers": answers }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

/// Which join form an admin command edits: the onboarding survey when absent,
/// the join application when asked. Anything else is a caller bug, said so.
fn admin_form_path(form: Option<&str>) -> Result<&'static str, String> {
    match form {
        None | Some("survey") => Ok("survey"),
        Some("application") => Ok("application"),
        Some(other) => Err(format!("unknown join form '{other}'")),
    }
}

#[tauri::command]
pub(crate) async fn survey_admin_get(
    hub_url: String,
    form: Option<String>,
    state: State<'_, AppState>,
) -> Result<Option<SurveyAdminTs>, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!(
            "{base}/admin/{}",
            admin_form_path(form.as_deref())?
        ))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    resp.json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))
}

#[tauri::command]
pub(crate) async fn survey_admin_put(
    hub_url: String,
    survey: SurveyAdminTs,
    form: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .put(format!(
            "{base}/admin/{}",
            admin_form_path(form.as_deref())?
        ))
        .bearer_auth(&token)
        .json(&survey)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(resp.text().await.unwrap_or_default());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn survey_admin_responses(
    hub_url: String,
    status: String,
    state: State<'_, AppState>,
) -> Result<Vec<SurveyResponseAdminTs>, String> {
    let token = crate::state::session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    crate::admin::get_all_pages(
        &state.http_client,
        &format!("{base}/admin/survey/responses"),
        &token,
        &[("status", status)],
        |r: &SurveyResponseAdminTs| r.response_id.clone(),
    )
    .await
}
