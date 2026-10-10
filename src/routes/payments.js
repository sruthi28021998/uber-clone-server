import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { requireDbUser } from "../middleware/auth.js";
import { stripe } from "../lib/stripe.js";
import { isUuid } from "../lib/utils.js";
import { onPaymentSucceeded } from "../lib/paymentEvents.js";

const CURRENCY = process.env.PAYMENT_CURRENCY || "usd";
const DRIVER_SHARE = 0.8;

const router = Router();
router.use(requireDbUser);

// Create (or reuse) a payment for a completed ride
router.post("/intent", async (req, res, next) => {
  try {
    const { ride_id } = req.body;
    if (!isUuid(ride_id)) return res.status(400).json({ error: "Invalid ride" });

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

    const pending = existing?.find((p) => p.status === "pending" && p.stripe_payment_intent_id);
    if (pending) {
      const intent = await stripe.paymentIntents.retrieve(pending.stripe_payment_intent_id);
      if (intent.status !== "canceled") return res.json({ clientSecret: intent.client_secret });
    }

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(fare * 100),
      currency: CURRENCY,
      payment_method_types: ["card"],
      metadata: { ride_id: ride.id },
    });

    const driverEarning = Math.round(fare * DRIVER_SHARE * 100) / 100;
    const { error: insertError } = await supabase.from("payments").insert({
      ride_id: ride.id,
      amount: fare,
      currency: CURRENCY,
      stripe_payment_intent_id: intent.id,
      status: "pending",
      driver_earning: driverEarning,
      platform_fee: Math.round((fare - driverEarning) * 100) / 100,
    });
    if (insertError) throw insertError;

    res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    next(err);
  }
});

// Called after the card is charged. Verifies the result with Stripe.
router.post("/confirm", async (req, res, next) => {
  try {
    const { payment_intent_id } = req.body;
    if (typeof payment_intent_id !== "string") {
      return res.status(400).json({ error: "Invalid payment" });
    }

    const { data: payment, error } = await supabase
      .from("payments")
      .select("*, ride:rides(id, rider_id, driver_id)")
      .eq("stripe_payment_intent_id", payment_intent_id)
      .maybeSingle();
    if (error) throw error;
    if (!payment || payment.ride.rider_id !== req.user.id) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (intent.status !== "succeeded") {
      return res.status(400).json({ error: "Payment not completed" });
    }
    if (payment.status === "succeeded") return res.json(payment);

    const { data, error: updateError } = await supabase
      .from("payments")
      .update({ status: "succeeded" })
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