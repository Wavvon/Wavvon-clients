/**
 * Where to sign in for a hub whose /info names a `farm_url`. A farm hosts its
 * hubs under its own origin (`<farm>/hub/<slug>`), so a genuine farm_url
 * shares the hub's origin; any other address is one a hostile hub chose, and
 * signing in there would hand it a token for the user that works on every hub
 * of that farm (Wavvon-server#294). Such a farm_url is ignored and the hub
 * itself is asked.
 */
export function farmAuthUrl(farmUrl: string | null | undefined, hubUrl: string): string {
  if (!farmUrl) return hubUrl;
  try {
    return new URL(farmUrl).origin === new URL(hubUrl).origin ? farmUrl : hubUrl;
  } catch {
    return hubUrl;
  }
}
