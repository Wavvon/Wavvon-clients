import { useEffect, useState } from "react";

export interface ChannelTalkPowerTabActions {
  getTalkPower: (channelId: string) => Promise<number>;
  setTalkPower: (channelId: string, minTalkPower: number) => Promise<void>;
}

interface Props {
  channelId: string;
  actions: ChannelTalkPowerTabActions;
}

export function ChannelTalkPowerTab({ channelId, actions }: Props) {
  const [talkPower, setTalkPowerState] = useState(0);
  const [talkPowerInput, setTalkPowerInput] = useState("0");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    actions
      .getTalkPower(channelId)
      .then((tp) => {
        setTalkPowerState(tp);
        setTalkPowerInput(String(tp));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  async function handleSave() {
    const n = Number(talkPowerInput);
    if (!Number.isFinite(n) || n < 0) return;
    const val = Math.floor(n);
    try {
      await actions.setTalkPower(channelId, val);
      setTalkPowerState(val);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch { /* left as-is; the save button stays available to retry */ }
  }

  return (
    <div className="settings-section">
      <label className="settings-label" htmlFor="channel-talk-power">Talk power</label>
      <p className="muted">
        Minimum priority required to speak in this channel. 0 allows anyone.
      </p>
      <div className="settings-row">
        <input
          id="channel-talk-power"
          type="number"
          min={0}
          value={talkPowerInput}
          onChange={(e) => setTalkPowerInput(e.target.value)}
          style={{ width: "80px" }}
        />
        <button onClick={handleSave}>{saved ? "Saved" : "Save"}</button>
      </div>
      <p className="muted">Current: {talkPower}</p>
    </div>
  );
}
