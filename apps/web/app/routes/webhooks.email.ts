import { receivedEmailText, tokenFromAddresses, verifyWebhook } from "../../server/outreach/email.server";
import { handleReply } from "../../server/outreach/outreach.server";
import type { Route } from "./+types/webhooks.email";

type ReceivedEvent = {
  type: string;
  data?: { email_id?: string; to?: string[]; received_for?: string[] };
};

// Resend `email.received` webhook: match the reply token, classify, update the pipeline.
export async function action({ request }: Route.ActionArgs) {
  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers)) return new Response("Invalid signature", { status: 401 });
  const event = JSON.parse(raw) as ReceivedEvent;
  if (event.type !== "email.received" || !event.data?.email_id) return new Response("ignored");
  const token = tokenFromAddresses([...(event.data.to ?? []), ...(event.data.received_for ?? [])]);
  if (!token) return new Response("no reply token");
  const text = await receivedEmailText(event.data.email_id);
  const matched = await handleReply(token, text);
  return new Response(matched ? "ok" : "unknown token");
}
