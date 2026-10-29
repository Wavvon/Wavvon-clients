import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ApplicationPanel, type ApplicationActions } from "@wavvon/ui";
import type { ApplicationStatus, Survey } from "@wavvon/ui";
import { useHubCapabilities } from "../hooks/useHubCapabilities";

/** The join application on the pending screen, on hubs that take one. */
export function PendingApplication({ hubUrl }: { hubUrl: string | null }) {
  const capable = useHubCapabilities(hubUrl).includes("admission.application");
  const actions = useMemo<ApplicationActions | null>(() => hubUrl ? {
    getForm: () => invoke<Survey | null>("application_form", { hubUrl }),
    getStatus: () => invoke<ApplicationStatus>("application_status", { hubUrl }),
    submit: (surveyId, answers) => invoke("application_submit", { hubUrl, surveyId, answers }),
  } : null, [hubUrl]);
  if (!capable || !actions) return null;
  return <ApplicationPanel actions={actions} />;
}
