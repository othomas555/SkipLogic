// Stripe Connect webhook for public skip bookings.
// Configure a Connect webhook destination for checkout.session.completed
// and checkout.session.async_payment_succeeded, then set STRIPE_CONNECT_WEBHOOK_SECRET.
import Stripe from "stripe";
import confirmBooking from "../public/confirm-booking";

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.STRIPE_CONNECT_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: "Webhook is not configured" });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      await rawBody(req),
      req.headers["stripe-signature"],
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).json({ error: "Invalid Stripe signature" });
  }
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    return res.status(200).json({ received: true });
  }
  const session = event.data.object;
  if (session.mode !== "payment" || session.payment_status !== "paid" || !event.account) {
    return res.status(200).json({ received: true });
  }
  const slug = session.metadata?.booking_slug;
  if (!slug) return res.status(200).json({ received: true });

  // Reuse the existing server-side verification, booking, and invoicing logic.
  // The confirmation handler retrieves the session directly from the subscriber's
  // Stripe account; event payload alone is never trusted to create a job.
  let resultStatus = 500;
  let resultBody = {};
  const reply = {
    status(code) { resultStatus = code; return this; },
    json(value) { resultBody = value; return this; },
    setHeader() { return this; },
  };
  await confirmBooking(
    { method: "POST", body: { session_id: session.id, slug }, headers: req.headers },
    reply
  );
  if (resultStatus >= 200 && resultStatus < 300 && resultBody.ok) {
    return res.status(200).json({ received: true });
  }
  console.error("Stripe Connect booking confirmation failed", {
    eventId: event.id, sessionId: session.id, status: resultStatus,
    error: resultBody.error,
  });
  return res.status(500).json({ error: "Booking confirmation failed; Stripe should retry" });
}
