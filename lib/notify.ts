import "server-only";
import { fmtDateTime, money } from "./time";

/**
 * Notifications.
 * - Email via Resend (https://resend.com), if RESEND_API_KEY + EMAIL_FROM are set.
 * - WhatsApp via Twilio, if TWILIO_* variables are set.
 * - Otherwise messages are printed to the terminal, so you can develop for free.
 * A failed notification never breaks a booking.
 */

type FullBooking = {
  manageToken: string;
  startsAt: Date;
  priceCents: number;
  service: { name: string };
  staff: { name: string };
  customer: { name: string; email: string | null; phone: string | null };
};
type Biz = { name: string; timezone: string; phone: string | null; address: string | null };

const APP_URL = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

export type NotifyKind = "confirmed" | "rescheduled" | "cancelled" | "reminder";

export async function notifyCustomer(kind: NotifyKind, b: FullBooking, biz: Biz) {
  const when = fmtDateTime(b.startsAt, biz.timezone);
  const link = `${APP_URL()}/booking/${b.manageToken}`;
  const first = b.customer.name.split(" ")[0];

  const headline = {
    confirmed: "Your booking is confirmed ✅",
    rescheduled: "Your booking was moved 🔁",
    cancelled: "Your booking was cancelled",
    reminder: "Reminder: your appointment is tomorrow ⏰",
  }[kind];

  const lines = [
    `Hi ${first},`,
    headline,
    "",
    `${b.service.name} with ${b.staff.name}`,
    `When: ${when}`,
    `Price: ${money(b.priceCents)}`,
    biz.address ? `Where: ${biz.address}` : "",
    "",
    kind === "cancelled" ? `Book again: ${APP_URL()}/book` : `View, reschedule or cancel: ${link}`,
    "",
    biz.name,
  ].filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));

  const text = lines.join("\n");
  const subject = `${headline.replace(/[^\w\s:,'-]/g, "").trim()} – ${biz.name}`;

  await Promise.allSettled([
    b.customer.email ? sendEmail(b.customer.email, subject, text) : Promise.resolve(),
    b.customer.phone ? sendWhatsApp(b.customer.phone, text) : Promise.resolve(),
  ]);
}

async function sendEmail(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM; // e.g. "Glow Hair <onboarding@resend.dev>"
  if (!key || !from) {
    console.log(`\n📧 [EMAIL – dev mode, not sent]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text, html: toHtml(text) }),
    });
    if (!res.ok) console.error("Resend error:", res.status, await res.text());
  } catch (e) {
    console.error("Email failed:", e);
  }
}

async function sendWhatsApp(phone: string, text: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886" (Twilio sandbox)
  if (!sid || !token || !from) {
    console.log(`\n💬 [WHATSAPP – dev mode, not sent]\nTo: ${phone}\n${text}\n`);
    return;
  }
  try {
    const to = `whatsapp:${normalizePhone(phone)}`;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, Body: text }),
    });
    if (!res.ok) console.error("Twilio error:", res.status, await res.text());
  } catch (e) {
    console.error("WhatsApp failed:", e);
  }
}

/** "082 123 4567" -> "+27821234567" (defaults to South Africa) */
export function normalizePhone(p: string) {
  const digits = p.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+27" + digits.slice(1);
  return "+" + digits;
}

function toHtml(text: string) {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const body = esc(text)
    .replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br>");
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#222">${body}</div>`;
}
