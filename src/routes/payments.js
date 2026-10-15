import crypto from "crypto";
import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { requireDbUser } from "../middleware/auth.js";
import { stripe } from "../lib/stripe.js";
import { isUuid } from "../lib/utils.js";
import { onPaymentSucceeded } from "../lib/paymentEvents.js";

const CURRENCY = "inr";
const DRIVER_SHARE = 0.8;
const NO_PAYMENTS = { error: "Payments are not set up on the server yet" };

const clientUrl = () =>
  (process.env.CLIENT_URL || "http://localhost:5173").split(",")[0].trim();

// Demo mode must be switched on with PAYMENT_MODE=demo and is ignored once Stripe has a key
const demoMode = () => !stripe && process.env.PAYMENT_MODE === "demo";

const router = Router();
router.use(requireDbUser);

async function savePending(ride, fare, providerOrderId) {
  const driverEarning = Math.round(fare * DRIVER_SHARE * 100) / 100;
  const { error } = await supabase.from("payments").insert({
    ride_id: ride.id,
    amount: fare,
    currency: "INR",
    provider_order_id: providerOrderId,
    status: "pending",
    driver_earning: driverEarning,
    platform_fee: Math.round((fare - driverEarning) * 100) / 100,
  });
  if (error) throw error;
}

// Starts a payment for a completed ride: a Stripe Checkout URL, or a demo order
router.post("/checkout", async (req, res, next) => {
  try {
    const { ride_id } = req.body;
    if (!isUuid(ride_id)) return res.status(400).json({ error: "Invalid ride" });
    if (!stripe && !demoMode()) return res.status(503).json(NO_PAYMENTS);

    const { data: ride, error } = await supabase
      .from("rides")
      .select("*")
      .eq("id", ride_id)
      .eq("rider_id", req.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.status !== "completed") {
      return res.status(400).json({ error: "Ride is not completed yet" });
    }

    const fare = Number(ride.fare);
    if (!(fare > 0)) return res.status(400).json({ error: "Invalid fare" });

    const { data: existing } = await supabase
      .from("payments")
      .select("*")
      .eq("ride_id", ride.id)
      .order("created_at", { ascending: false });

    if (existing?.some((p) => p.status === "succeeded")) {
      return res.status(409).json({ error: "Ride already paid" });
    }
    const pending = existing?.find((p) => p.status === "pending" && p.provider_order_id);

    // Demo mode (no Stripe key)
    if (!stripe) {
      let orderId = pending?.provider_order_id;
      if (!orderId?.startsWith("demo_")) {
        orderId = `demo_${crypto.randomUUID()}`;
        await savePending(ride, fare, orderId);
      }
      return res.json({ demo: true, orderId });
    }

    // Reuse a Checkout page that is still open instead of creating a second one
    if (pending?.provider_order_id.startsWith("cs_")) {
      const open = await stripe.checkout.sessions.retrieve(pending.provider_order_id);
      if (open.status === "open" && open.url) return res.json({ url: open.url });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: CURRENCY,
            product_data: {
              name: `Ride: ${ride.pickup_address} to ${ride.dropoff_address}`.slice(0, 200),
            },
            unit_amount: Math.round(fare * 100), // paise
          },
          quantity: 1,
        },
      ],
      customer_email: req.user.email || undefined,
      metadata: { ride_id: ride.id },
      success_url: `${clientUrl()}/rides/${ride.id}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl()}/rides/${ride.id}`,
    });

    await savePending(ride, fare, session.id);
    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

// Confirms a payment: a Stripe session_id (verified with Stripe) or a demo_order_id
router.post("/confirm", async (req, res, next) => {
  try {
    const { session_id, demo_order_id } = req.body;
    const isDemo = demo_order_id !== undefined;
    let orderId;

    if (isDemo) {
      if (!demoMode()) return res.status(403).json({ error: "Demo payments are turned off" });
      if (typeof demo_order_id !== "string" || !demo_order_id.startsWith("demo_")) {
        return res.status(400).json({ error: "Invalid payment" });
      }
      orderId = demo_order_id;
    } else {
      if (typeof session_id !== "string" || !session_id.startsWith("cs_")) {
        return res.status(400).json({ error: "Invalid payment" });
      }
      if (!stripe) return res.status(503).json(NO_PAYMENTS);
      orderId = session_id;
    }

    const { data: payment, error } = await supabase
      .from("payments")
      .select("*, ride:rides(id, rider_id, driver_id)")
      .eq("provider_order_id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!payment || payment.ride.rider_id !== req.user.id) {
      return res.status(404).json({ error: "Payment not found" });
    }

    let paymentRef = "demo";
    if (!isDemo) {
      const session = await stripe.checkout.sessions.retrieve(orderId);
      if (session.payment_status !== "paid") {
        return res.status(400).json({ error: "Payment not completed" });
      }
      paymentRef =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
    }

    if (payment.status === "succeeded") return res.json(payment);

    const { data, error: updateError } = await supabase
      .from("payments")
      .update({ status: "succeeded", provider_payment_id: paymentRef })
      .eq("id", payment.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (updateError) throw updateError;

    if (data) onPaymentSucceeded(data, payment.ride).catch(console.error);
    res.json(data ?? payment);
  } catch (err) {
    next(err);
  }
});

// Driver earnings summary
router.get("/earnings", async (req, res, next) => {
  try {
    if (req.user.role !== "driver") return res.status(403).json({ error: "Drivers only" });

    const { data: rides, error } = await supabase
      .from("rides")
      .select("id")
      .eq("driver_id", req.user.id);
    if (error) throw error;

    const ids = rides.map((r) => r.id);
    if (!ids.length) return res.json({ total: 0, paidRides: 0 });

    const { data: pays, error: payError } = await supabase
      .from("payments")
      .select("driver_earning")
      .eq("status", "succeeded")
      .in("ride_id", ids);
    if (payError) throw payError;

    const total = pays.reduce((sum, p) => sum + Number(p.driver_earning ?? 0), 0);
    res.json({ total: Math.round(total * 100) / 100, paidRides: pays.length });
  } catch (err) {
    next(err);
  }
});

export default router;