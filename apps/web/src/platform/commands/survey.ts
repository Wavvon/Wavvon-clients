import { hubFetch } from "../http";

export interface SurveyChoice {
  id: string;
  label: string;
  display_order: number;
  role_ids: string[];
}
export interface SurveyQuestion {
  id: string;
  prompt: string;
  kind: "text" | "choice";
  required: boolean;
  display_order: number;
  choices?: SurveyChoice[];
}
export interface SurveyAdmin {
  id: string;
  enabled: boolean;
  questions: SurveyQuestion[];
}
export interface SurveyResponseView {
  response_id: string;
  pubkey: string;
  display_name?: string;
  submitted_at: number;
  answers: { question_id: string; prompt: string; choice_label?: string; text_answer?: string }[];
}
export interface SurveyAnswerInput {
  question_id: string;
  choice_id?: string;
  text_answer?: string;
}

// --- Admin ---
export async function getSurveyAdmin(): Promise<SurveyAdmin | null> {
  const r = await hubFetch("/admin/survey");
  return r.json() as Promise<SurveyAdmin | null>;
}
export async function setSurveyAdmin(survey: SurveyAdmin): Promise<void> {
  await hubFetch("/admin/survey", { method: "PUT", body: JSON.stringify(survey) });
}
export async function getSurveyResponses(): Promise<SurveyResponseView[]> {
  const r = await hubFetch("/admin/survey/responses");
  return r.json() as Promise<SurveyResponseView[]>;
}

// --- Member ---
export async function getCurrentSurvey(): Promise<SurveyAdmin | null> {
  // GET /survey/current returns the public survey (no role_ids); shape is
  // otherwise compatible with SurveyAdmin for our purposes.
  const r = await hubFetch("/survey/current");
  return r.json() as Promise<SurveyAdmin | null>;
}
export async function submitSurvey(surveyId: string, answers: SurveyAnswerInput[]): Promise<void> {
  await hubFetch("/survey/submit", {
    method: "POST",
    body: JSON.stringify({ survey_id: surveyId, answers }),
  });
}
