// One microphone capture, shared by the voice session and the mic meter that
// claims to show what it will send.
//
// `getUserMedia({ audio: true })` does not mean "a microphone": it means
// "whatever this browser thinks a microphone should be", and browsers
// disagree. Measured on one machine against the same page, Chromium 149
// returns a track with `autoGainControl`, `echoCancellation` and
// `noiseSuppression` all on; Firefox 151 returns all three off. Everything
// downstream was identical — 48 kHz context, 4096-sample buffers, the same
// ~50 datagrams a second — so the fault never showed up as packet loss or a
// send-rate dip. It only sounded wrong, and only to the far end: raw mic noise
// into Opus VOIP at the bitrate this app uses is what a listener hears as a
// bad connection. Stating the three constraints is the whole fix; both
// browsers honour them when asked.
//
// Leaving gain to the hardware also moves the VAD floor under the user's feet
// — `DEFAULT_SPEAKING.threshold` is a fixed RMS, so an un-normalised quiet mic
// sits below it and transmission is gated off with nothing to show for it.

const INPUT_DEVICE_KEY = "wavvon.audioInputDevice";

/** Opus runs at 48 kHz here; the meter must resolve to the same rate as the
 *  send path or it measures a signal the session never sees. */
export const CAPTURE_SAMPLE_RATE = 48000;

/** The input device chosen in Settings → Voice, or null for the default. */
export function selectedInputDeviceId(): string | null {
  try {
    return localStorage.getItem(INPUT_DEVICE_KEY);
  } catch {
    return null;
  }
}

/** Capture the microphone the way voice will actually send it. */
export function captureMic(deviceId: string | null = selectedInputDeviceId()): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}
