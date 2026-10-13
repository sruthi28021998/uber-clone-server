import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { requireDbUser } from "../middleware/auth.js";
import { stripe } from "../lib/stripe.js";
import { isUuid } from "../lib/utils.js";
import { onPaymentSucceeded } from "../lib/paymentEvents.js";

const CURRENCY = "inr";
const DRIVER_SHARE = 0.8;
const NO_STRIPE = { error: "Stripe is not set up on the server yet" };

const clientUrl = () =>
  (process.env.CLIENT_URL || "http://localhost:5173").split(",")[0].trim();

const router = Router();
router.use(requireDbUser);

// Creates a Stripe Checkout page for a completed ride and returns its URL
router.post("/checkout", async (req, res, next) => {
  try {
    const { ride_id } = req.body;
    if (!isUuid(ride_id)) return res.status(400).json({ error: "Invalid ride" });
    if (!stripe) return res.status(503).json(NO_STRIPE);

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

    // Reuse a Checkout page that is still open instead of creating a second one
    const pending = existing?.find((p) => p.status === "pending" && p.provider_order_id);
    if (pending) {
      const open = await stripe.checkout.sessions.retrieve(pending.provider_order_id);
      if (open.status === "open" && open.url) return res.json({ url: open.url });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
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

    const driverEarning = Math.round(fare * DRIVER_SHARE * 100) / 100;
    const { error: insertError } = await supabase.from("payments").insert({
      ride_id: ride.id,
      amount: fare,
      currency: "INR",
      provider_order_id: session.id,
      status: "pending",
      driver_earning: driverEarning,
      platform_fee: Math.round((fare - driverEarning) * 100) / 100,
    });
    if (insertError) throw insertError;

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

// Called when Stripe sends the rider back. Asks Stripe whether it was really paid.
router.post("/confirm", async (req, res, next) => {
  try {
    const { session_id } = req.body;
    if (typeof session_id !== "string" || !session_id.startsWith("cs_")) {
      return res.status(400).json({ error: "Invalid payment" });
    }
    if (!stripe) return res.status(503).json(NO_STRIPE);

    const { data: payment, error } = await supabase
      .from("payments")
      .select("*, ride:rides(id, rider_id, driver_id)")
      .eq("provider_order_id", session_id)
      .maybeSingle();
    if (error) throw error;
    if (!payment || payment.ride.rider_id !== req.user.id) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed" });
    }
    if (payment.status === "succeeded") return res.json(payment);

    const intentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    const { data, error: updateError } = await supabase
      .from("payments")
      .update({ status: "succeeded", provider_payment_id: intentId })
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