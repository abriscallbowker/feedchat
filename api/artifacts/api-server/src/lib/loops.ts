const LOOPS_API_KEY = process.env.LOOPS_API_KEY;
const BASE_URL = "https://app.loops.so/api/v1";

async function post(path: string, body: unknown): Promise<void> {
  if (!LOOPS_API_KEY) {
    console.warn("[loops] LOOPS_API_KEY not set, skipping");
    return;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOOPS_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[loops] ${path} failed ${res.status}: ${text}`);
  }
}

export function createContact(email: string, companyName?: string): void {
  const body: Record<string, unknown> = { email, source: "Webapp" };
  if (companyName) body.companyName = companyName;
  post("/contacts/create", body).catch((err) =>
    console.error("[loops] createContact error:", err),
  );
}

export function sendEvent(
  email: string,
  eventName: string,
  eventProperties?: Record<string, unknown>,
): void {
  const body: Record<string, unknown> = { email, eventName };
  if (eventProperties && Object.keys(eventProperties).length > 0) {
    body.eventProperties = eventProperties;
  }
  post("/events/send", body).catch((err) =>
    console.error("[loops] sendEvent error:", err),
  );
}

export function deleteContact(email: string): void {
  post("/contacts/delete", { email }).catch((err) =>
    console.error("[loops] deleteContact error:", err),
  );
}
