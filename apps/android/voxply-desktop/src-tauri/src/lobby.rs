use crate::state::{session_for_url, AppState};
use serde::{Deserialize, Serialize};
use tauri::State;

// --- Lobby DTOs ---

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LobbyStatusResult {
    pub(crate) status: String,
    pub(crate) required_level: u32,
    pub(crate) current_level: u32,
    pub(crate) entered_at: Option<i64>,
    pub(crate) welcome_md: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LobbySubmitResult {
    pub(crate) promoted: bool,
    pub(crate) new_level: u32,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct LobbyWelcome {
    pub(crate) welcome_md: String,
    pub(crate) hub_name: String,
    pub(crate) required_level: u32,
}

// --- Challenge DTOs ---

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ChallengePrompt {
    pub(crate) id: String,
    pub(crate) mode: String,
    pub(crate) prompt_svg: Option<String>,
    pub(crate) expires_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ChallengeResult {
    pub(crate) ok: bool,
    pub(crate) token: Option<String>,
    pub(crate) expires_at: Option<i64>,
    pub(crate) next_challenge: Option<ChallengePrompt>,
    pub(crate) attempts_remaining: Option<u32>,
}

// --- Survey DTOs ---

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyChoiceTs {
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) display_order: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyQuestionTs {
    pub(crate) id: String,
    pub(crate) prompt: String,
    pub(crate) kind: String,
    pub(crate) required: bool,
    pub(crate) display_order: i64,
    pub(crate) choices: Option<Vec<SurveyChoiceTs>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyPublicTs {
    pub(crate) id: String,
    pub(crate) questions: Vec<SurveyQuestionTs>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyChoiceAdminTs {
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) display_order: i64,
    pub(crate) role_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyQuestionAdminTs {
    pub(crate) id: String,
    pub(crate) prompt: String,
    pub(crate) kind: String,
    pub(crate) required: bool,
    pub(crate) display_order: i64,
    pub(crate) choices: Option<Vec<SurveyChoiceAdminTs>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyAdminTs {
    pub(crate) id: String,
    pub(crate) enabled: bool,
    pub(crate) questions: Vec<SurveyQuestionAdminTs>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyAnswer {
    pub(crate) question_id: String,
    pub(crate) choice_id: Option<String>,
    pub(crate) text_answer: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveySubmitResult {
    pub(crate) next_state: String,
    pub(crate) applied_roles: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyAnswerView {
    pub(crate) question_id: String,
    pub(crate) prompt: String,
    pub(crate) choice_label: Option<String>,
    pub(crate) text_answer: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct SurveyResponseAdminTs {
    pub(crate) response_id: String,
    pub(crate) pubkey: String,
    pub(crate) display_name: Option<String>,
    pub(crate) submitted_at: i64,
    pub(crate) answers: Vec<SurveyAnswerView>,
}

// --- Lobby commands ---

#[tauri::command]
pub(crate) async fn lobby_status(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<LobbyStatusResult, String> {
    let token = session_for_url(&state, &hub_url)?;
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
    let token = session_for_url(&state, &hub_url)?;
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
    let token = session_for_url(&state, &hub_url)?;
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
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .put(format!("{base}/hub/settings/lobby"))
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

// --- Challenge commands ---

#[tauri::command]
pub(crate) async fn challenge_fetch(
    hub_url: String,
    pubkey: String,
    state: State<'_, AppState>,
) -> Result<ChallengePrompt, String> {
    let base = hub_url.trim_end_matches('/');
    // No auth needed for /challenge/new
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
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .put(format!("{base}/hub/settings/challenge"))
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

// --- Survey commands ---

#[tauri::command]
pub(crate) async fn survey_current(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Option<SurveyPublicTs>, String> {
    let token = session_for_url(&state, &hub_url)?;
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
    let token = session_for_url(&state, &hub_url)?;
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

#[tauri::command]
pub(crate) async fn survey_admin_get(
    hub_url: String,
    state: State<'_, AppState>,
) -> Result<Option<SurveyAdminTs>, String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/survey"))
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
    state: State<'_, AppState>,
) -> Result<(), String> {
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .put(format!("{base}/admin/survey"))
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
    let token = session_for_url(&state, &hub_url)?;
    let base = hub_url.trim_end_matches('/');
    let resp = state
        .http_client
        .get(format!("{base}/admin/survey/responses"))
        .bearer_auth(&token)
        .query(&[("status", &status)])
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
