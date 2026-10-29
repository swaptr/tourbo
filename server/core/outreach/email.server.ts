import { createHmac, timingSafeEqual } from "node:crypto";

import { getEnv } from "../env.server.ts";

const API = "https://api.resend.com";

export function replyAddress(token: string) {
  const domain = getEnv().OUTREACH_REPLY_DOMAIN;
  return domain ? `reply+${token}@${domain}` : undefined;
}

export function tokenFromAddresses(addresses: string[]) {
  for (const address of addresses) {
    const match = /reply\+([a-z0-9]+)@/i.exec(address);
    if (match) return match[1].toLowerCase();
  }
  return undefined;
}

// Sends to the demo inbox only. Returns undefined when no API key is set (simulated send).
export async function sendEmail(input: { subject: string; text: string; token: string }) {
  const env = getEnv();
  if (!env.RESEND_API_KEY) return undefined;
  const reply = replyAddress(input.token);
  const res = await fetch(`${API}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `outreach-${input.token}`,
    },
    body: JSON.stringify({
      from: env.OUTREACH_FROM,
      to: [env.OUTREACH_INBOX],
      subject: input.subject,
      text: input.text,
      ...(reply && { reply_to: reply }),
    }),
  });
  if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

// Webhook bodies omit the text; fetch it from the Received emails API.
export async function receivedEmailText(emailId: string) {
  const env = getEnv();
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch(`${API}/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Resend receive failed: ${res.status}`);
  const email = (await res.json()) as { text: string | null; html: string | null };
  return stripQuoted(email.text ?? (email.html ?? "").replace(/<[^>]+>/g, " "));
}

// Keep only the new part of a reply.
export function stripQuoted(text: string) {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^On .+wrote:$/.test(line.trim()) || line.startsWith("-----Original")) break;
    if (!line.startsWith(">")) lines.push(line);
  }
  return lines.join("\n").trim();
}

const TOLERANCE_S = 5 * 60;

// Svix signing (Resend webhooks): HMAC-SHA256 over `${id}.${timestamp}.${rawBody}`,
// key = base64-decoded secret after `whsec_`; header holds space-separated `v1,<base64>`.
export function verifyWebhook(rawBody: string, headers: Headers) {
  const secret = getEnv().RESEND_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signatures.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export function outreachMode() {
  const env = getEnv();
  return {
    sending: env.RESEND_API_KEY ? ("resend" as const) : ("simulated" as const),
    inbox: env.OUTREACH_INBOX,
    inbound: Boolean(env.RESEND_WEBHOOK_SECRET && env.OUTREACH_REPLY_DOMAIN),
  };
}
