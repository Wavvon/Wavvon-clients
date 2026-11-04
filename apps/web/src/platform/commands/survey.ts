import { hubFetch } from "../http";
import { activeHubCapabilities } from "../session";
import { fetchAllPages, LIST_CURSOR_ADMIN_CAP, LIST_MAX_PAGES, LIST_PAGE_SIZE } from "./paged";
import type { ApplicationStatus, Survey, SurveyAnswer, SurveyResponseAdmin, SurveyChoice, SurveyQuestion, SurveyAdmin, SurveyResponseView } from "@wavvon/ui";

export type { SurveyChoice, SurveyQuestion, SurveyAdmin, SurveyResponseView };

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
// The join application, for a joiner held pending (join-forms.md).
export async function getApplicationForm(): Promise<Survey | null> {
  const r = await hubFetch("/application");
  return r.json() as Promise<Survey | null>;
}
export async function getApplicationStatus(): Promise<ApplicationStatus> {
  const r = await hubFetch("/application/status");
  return r.json() as Promise<ApplicationStatus>;
}
export async function submitApplication(surveyId: string, answers: SurveyAnswer[]): Promise<void> {
  await hubFetch("/application", {
    method: "POST",
    body: JSON.stringify({ survey_id: surveyId, answers }),
  });
}

// A joiner's answers, and the rejection, from the approval queue.
export async function getApplicationResponse(pubkey: string): Promise<SurveyResponseAdmin | null> {
  const r = await hubFetch(`/admin/application/responses/${pubkey}`);
  return r.json() as Promise<SurveyResponseAdmin | null>;
}
export async function rejectApplication(pubkey: string, reason: string): Promise<void> {
  await hubFetch(`/hub/pending/${pubkey}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || null }),
  });
}

// The join application's editor: same shape as the survey, its own route.
export async function getApplicationAdmin(): Promise<SurveyAdmin | null> {
  const r = await hubFetch("/admin/application");
  return r.json() as Promise<SurveyAdmin | null>;
}
export async function setApplicationAdmin(form: SurveyAdmin): Promise<void> {
  await hubFetch("/admin/application", { method: "PUT", body: JSON.stringify(form) });
}
export async function getSurveyResponses(): Promise<SurveyResponseView[]> {
  return fetchAllPages<SurveyResponseView>({
    capabilities: activeHubCapabilities(),
    capability: LIST_CURSOR_ADMIN_CAP,
    pageSize: LIST_PAGE_SIZE,
    maxPages: LIST_MAX_PAGES,
    cursorOf: (r) => r.response_id,
    fetchPage: async (params) =>
      (await (await hubFetch(params ? `/admin/survey/responses?${params}` : "/admin/survey/responses")).json()) as SurveyResponseView[],
    label: "getSurveyResponses",
  });
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
