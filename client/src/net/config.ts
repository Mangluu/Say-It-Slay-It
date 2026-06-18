// Single source of truth for backend endpoints. Defaults to local HTTP. For the
// phone MIC (which needs a secure context), run the backend over HTTPS and set
// VITE_API=https://127.0.0.1:8000 (see scripts/setup_certs.ps1 + README). The WS
// scheme and the phone controller URL protocol follow automatically.
export const API: string = (import.meta as any).env?.VITE_API || "http://127.0.0.1:8000";
export const WS: string = API.replace(/^http/, "ws"); // http->ws, https->wss

// Build the phone-facing controller origin for a given LAN IP, matching the
// backend's protocol + port.
export function controllerOrigin(lan: string): string {
  try {
    const u = new URL(API);
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return `${u.protocol}//${lan}:${port}`;
  } catch {
    return `http://${lan}:8000`;
  }
}
