import { SettingsPage } from "./SettingsPage";
import type { Hub } from "../types";
import type { useVoice } from "../hooks/useVoice";
import type { useVideo } from "../hooks/useVideo";
import type { useChannelMessages } from "../hooks/useChannelMessages";
import type { useSettingsProfile } from "../hooks/useSettingsProfile";

interface Props {
  onClose: () => void;
  onHubProfileSaved: (hubId: string) => void;
  hubs: Hub[];
  activeHubId: string | null;
  isAdmin: boolean;
  publicKey: string | null;
  blockedUsers: Set<string>;
  ignoredUsers: Set<string>;
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
  hideBirthdays: boolean;
  onToggleHideBirthdays: () => void;

  voice: ReturnType<typeof useVoice>;
  video: ReturnType<typeof useVideo>;
  channelMessages: ReturnType<typeof useChannelMessages>;
  settingsProfile: ReturnType<typeof useSettingsProfile>;
}

// Absorbs the SettingsPage call site the same way the sidebar/content-area
// containers do: grouped hook-result objects (voice, video, channelMessages,
// settingsProfile) replace the flat prop list. The voice-settings persist
// callbacks (onInputDeviceChange, onVadChange, ...) all close purely over
// `voice` fields, so they move in wholesale rather than staying as
// individually-threaded props in App.
export function SettingsPageContainer({
  onClose, onHubProfileSaved, hubs, activeHubId, isAdmin, publicKey,
  blockedUsers, ignoredUsers, onUnblock, onUnignore, knownNames,
  hideBirthdays, onToggleHideBirthdays,
  voice, video, channelMessages, settingsProfile,
}: Props) {
  return (
    <SettingsPage
      tab={settingsProfile.settingsTab}
      onTab={settingsProfile.setSettingsTab}
      onClose={onClose}
      onHubProfileSaved={onHubProfileSaved}
      hubs={hubs}
      theme={settingsProfile.theme}
      onThemeChange={settingsProfile.handleSetTheme}
      skin={settingsProfile.skin}
      onSkinChange={settingsProfile.handleSkinChange}
      onImportSkin={(s) => { settingsProfile.handleSkinChange(s); settingsProfile.handleSetTheme("custom"); }}
      backgroundMode={video.backgroundMode}
      backgroundSource={video.backgroundSource}
      backgroundActive={video.backgroundActive}
      onChangeBackground={video.changeBackground}
      videoInputs={video.videoInputs}
      videoInputDevice={video.videoInputDevice}
      onVideoInputDeviceChange={video.setVideoInputDevice}
      activeHubId={activeHubId}
      activeHubUrl={hubs.find((h) => h.hub_id === activeHubId)?.hub_url ?? ""}
      isAdmin={isAdmin}
      publicKey={publicKey}
      audioInputs={voice.audioInputs}
      audioOutputs={voice.audioOutputs}
      voiceInputDevice={voice.voiceInputDevice}
      voiceOutputDevice={voice.voiceOutputDevice}
      onInputDeviceChange={(v) => {
        voice.setVoiceInputDevice(v);
        voice.persistVoiceSettings(v, voice.voiceOutputDevice, voice.vadThreshold);
      }}
      onOutputDeviceChange={(v) => {
        voice.setVoiceOutputDevice(v);
        voice.persistVoiceSettings(voice.voiceInputDevice, v, voice.vadThreshold);
      }}
      mediaOutputDevices={voice.mediaOutputDevices}
      mediaOutputDeviceId={voice.mediaOutputDeviceId}
      onMediaOutputDeviceChange={voice.setMediaOutputDeviceId}
      vadThreshold={voice.vadThreshold}
      onVadChange={(v) => {
        voice.setVadThreshold(v);
        voice.persistVoiceSettings(voice.voiceInputDevice, voice.voiceOutputDevice, v);
      }}
      voiceMode={voice.voiceMode}
      onVoiceModeChange={(m) => {
        voice.setVoiceMode(m);
        voice.persistVoiceSettings(voice.voiceInputDevice, voice.voiceOutputDevice, voice.vadThreshold, m, voice.pttKey);
      }}
      pttKey={voice.pttKey}
      onPttKeyChange={(k) => {
        voice.setPttKey(k);
        voice.persistVoiceSettings(voice.voiceInputDevice, voice.voiceOutputDevice, voice.vadThreshold, voice.voiceMode, k);
      }}
      audioProfile={voice.audioProfile}
      onAudioProfileChange={(p) => {
        voice.setAudioProfile(p);
        voice.persistAudioSettings(p);
      }}
      customBitrate={voice.customBitrate}
      onCustomBitrateChange={(v) => {
        voice.setCustomBitrate(v);
        voice.persistAudioSettings(undefined, v);
      }}
      customApp={voice.customApp}
      onCustomAppChange={(v) => {
        voice.setCustomApp(v);
        voice.persistAudioSettings(undefined, undefined, v);
      }}
      customNoiseSuppress={voice.customNoiseSuppress}
      onCustomNoiseSuppressChange={(v) => {
        voice.setCustomNoiseSuppress(v);
        voice.persistAudioSettings(undefined, undefined, undefined, v);
      }}
      customVad={voice.customVad}
      onCustomVadChange={(v) => {
        voice.setCustomVad(v);
        voice.persistAudioSettings(undefined, undefined, undefined, undefined, v);
      }}
      customVadThreshold={voice.customVadThreshold}
      onCustomVadThresholdChange={(v) => {
        voice.setCustomVadThreshold(v);
        voice.persistAudioSettings(undefined, undefined, undefined, undefined, undefined, v);
      }}
      customChannels={voice.customChannels}
      onCustomChannelsChange={(v) => {
        voice.setCustomChannels(v);
        voice.persistAudioSettings(undefined, undefined, undefined, undefined, undefined, undefined, v);
      }}
      customFrameMs={voice.customFrameMs}
      onCustomFrameMsChange={(v) => {
        voice.setCustomFrameMs(v);
        voice.persistAudioSettings(undefined, undefined, undefined, undefined, undefined, undefined, undefined, v);
      }}
      customComplexity={voice.customComplexity}
      onCustomComplexityChange={(v) => {
        voice.setCustomComplexity(v);
        voice.persistAudioSettings(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, v);
      }}
      inVoice={voice.voiceChannelId !== null}
      mentionPingEnabled={channelMessages.mentionPingEnabled}
      onMentionPingChange={channelMessages.setMentionPingEnabled}
      micLevel={voice.micLevel}
      micTesting={voice.micTesting}
      onToggleMicTest={voice.toggleMicTest}
      recoveryPhrase={settingsProfile.recoveryPhrase}
      onShowRecovery={settingsProfile.handleShowRecovery}
      onRecoverIdentity={settingsProfile.handleRecoverIdentity}
      onClearLocalData={settingsProfile.handleClearLocalData}
      blocks={Array.from(blockedUsers).map((p) => ({ pubkey: p, since: 0 }))}
      ignores={Array.from(ignoredUsers).map((p) => ({ pubkey: p, since: 0 }))}
      onUnblock={onUnblock}
      onUnignore={onUnignore}
      knownNames={knownNames}
      hideBirthdays={hideBirthdays}
      onToggleHideBirthdays={onToggleHideBirthdays}
    />
  );
}
