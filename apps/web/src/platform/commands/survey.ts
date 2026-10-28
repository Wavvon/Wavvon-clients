import { hubFetch } from "../http";
import { activeHubCapabilities } from "../session";
import { fetchAllPages, LIST_CURSOR_ADMIN_CAP, LIST_MAX_PAGES, LIST_PAGE_SIZE } from "./paged";
import type { SurveyChoice, SurveyQuestion, SurveyAdmin, SurveyResponseView } from "@wavvon/ui";

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
