import { API } from "./config";

// Client event logger: batches game events and POSTs them to the backend, which
// appends them to the session JSONL (see server/app/log.py). Best-effort: never
// throws, never blocks gameplay. Captures the state stream that, together with the
// server-side input stream, lets us review a session and later train the CPU AI.
let buf: Array<Record<string, unknown>> = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function logEvent(kind: string, data: Record<string, unknown> = {}): void {
  buf.push({ kind, ct: Date.now(), ...data });
  if (buf.length >= 24) flush();
  else if (!timer) timer = setTimeout(flush, 2000);
}

export function flush(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!buf.length) return;
  const events = buf;
  buf = [];
  try {
    void fetch(`${API}/log`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true,
    }).catch(() => { /* best effort */ });
  } catch { /* best effort */ }
}
