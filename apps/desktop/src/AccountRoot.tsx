import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import App, { type OnboardingExit } from "./App";
import { OnboardingFrame, ProfileEditorSection, InterestsStep, HubSuggestions, hubInterestsOrDefault, saveHubInterests, type HubInterests } from "@wavvon/ui";
import { DISCOVERY_URL } from "./constants";
import { fetchWithTimeout } from "./utils/fetchWithTimeout";
import { AddIdentityFlow } from "./components/AddIdentityFlow";
import { listAccounts, setInPlaceSwitchHandler, type AccountSummary } from "./accounts/store";
import { buildProfileEditorActions, loadDefaultProfileAsync } from "./utils/profileEditorActions";

// Account switching is a key-remount, not a reload -- the desktop analogue
// of web's AccountRoot.tsx (decisions.md "Account switching is an in-place
// key-remount, guarded, not a reload"). Changing <App>'s `key` unmounts the
// outgoing account's whole tree and mounts a fresh one, resetting every
// piece of React state by construction; the Rust side tears down the
// per-account live handles (hub WebSocket sessions) before the flip (see
// accounts::teardown_live_sessions in src-tauri).
//
// Unlike web, "no accounts yet" is a real reachable state here: the
// ~/.wavvon/ restructure starts empty (settings-ia.md §3/§5, alpha rules —
// no migration of the old single-identity file), so this also gates on
// that with the same create/recover/pair flow Settings opens to add one.
export default function AccountRoot() {
  const { t, i18n } = useTranslation();
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The first account on this device goes through the profile step, as on web.
  const [profileStep, setProfileStep] = useState(false);
  // With a directory, the first account then picks interests and sees suggestions.
  const [directoryStep, setDirectoryStep] = useState<"interests" | "hubs" | null>(null);
  const [interests, setInterests] = useState<HubInterests>(() => hubInterestsOrDefault(i18n.language));
  const [onboardingExit, setOnboardingExit] = useState<OnboardingExit | undefined>(undefined);

  async function refresh() {
    const list = await listAccounts();
    setAccounts(list);
    setActiveAccountId(list.find((a) => a.is_active)?.id ?? list[0]?.id ?? null);
  }

  useEffect(() => {
    setInPlaceSwitchHandler(({ id }) => { setOnboardingExit(undefined); setActiveAccountId(id); });
    refresh().catch((e) => setError(String(e)));
    return () => setInPlaceSwitchHandler(null);
  }, []);

  // The first account then goes through the profile step, as on web.
  async function afterFirstIdentity() {
    await refresh();
    await loadDefaultProfileAsync().catch(() => null);
    setProfileStep(true);
  }

  if (accounts === null) {
    // Brief loading flash only -- avoids a placeholder screen web rejected
    // for the equivalent switch case (decisions.md "no transition overlay").
    return null;
  }

  if (accounts.length === 0) {
    return (
      <>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <AddIdentityFlow variant="initial" onDone={() => { afterFirstIdentity().catch((e) => setError(String(e))); }} />
      </>
    );
  }

  function afterProfile() {
    setProfileStep(false);
    if (DISCOVERY_URL) setDirectoryStep("interests");
  }

  function finishOnboarding(exit?: OnboardingExit) {
    setOnboardingExit(exit);
    setDirectoryStep(null);
  }

  if (directoryStep === "interests") {
    return (
      <OnboardingFrame>
        <InterestsStep
          initial={interests}
          onDone={(v) => { saveHubInterests(v); setInterests(v); setDirectoryStep("hubs"); }}
          onSkip={() => finishOnboarding()}
        />
      </OnboardingFrame>
    );
  }

  if (directoryStep === "hubs" && DISCOVERY_URL) {
    return (
      <OnboardingFrame>
        <h2>{t("onboarding.hubs.title")}</h2>
        <p className="onboarding-lede">{t("onboarding.hubs.hint")}</p>
        <HubSuggestions
          directoryUrl={DISCOVERY_URL}
          fetchUrl={fetchWithTimeout}
          interests={interests}
          onJoinHub={(hubUrl, inviteCode) => finishOnboarding({ join: { hubUrl, inviteCode } })}
          onEditInterests={() => setDirectoryStep("interests")}
          onSeeAll={() => finishOnboarding({ openDirectory: true })}
        />
        <button className="btn-ghost" onClick={() => finishOnboarding()}>{t("onboarding.later")}</button>
      </OnboardingFrame>
    );
  }

  if (profileStep && activeAccountId) {
    return (
      <OnboardingFrame>
        <h2>{t("onboarding.profile.title")}</h2>
        <p className="onboarding-lede">{t("onboarding.profile.hint")}</p>
        <ProfileEditorSection
          hubs={[]}
          account={{ id: activeAccountId }}
          isActive={false}
          publicKey={null}
          actions={buildProfileEditorActions([])}
          onboarding={{ onSaved: afterProfile, onSkip: afterProfile }}
        />
      </OnboardingFrame>
    );
  }

  return <App key={activeAccountId ?? "no-account"} accountId={activeAccountId} onboardingExit={onboardingExit} />;
}
