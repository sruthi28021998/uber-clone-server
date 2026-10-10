import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { requireDbUser } from "../middleware/auth.js";
import { roadDistanceKm, calculateFare, estimateAll, RIDE_TYPES } from "../lib/fare.js";
import { toNum, isUuid } from "../lib/utils.js";
import { emitToUser, emitToDrivers } from "../lib/realtime.js";

const router = Router();
router.use(requireDbUser);

router.get("/", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("rides")
      .select("*")
      .or(`rider_id.eq.${req.user.id},driver_id.eq.${req.user.id}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Fare options for a route: GET /api/rides/estimate?plat=&plng=&dlat=&dlng=
router.get("/estimate", (req, res) => {
  const c = ["plat", "plng", "dlat", "dlng"].map((k) => toNum(req.query[k]));
  if (c.some((v) => v === null)) return res.status(400).json({ error: "Invalid coordinates" });
  const km = roadDistanceKm(...c);
  res.json({ distanceKm: Math.round(km * 10) / 10, fares: estimateAll(km) });
});

router.get("/:id", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("rides")
      .select("*, driver:users!driver_id(name, phone, image_url)")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data || (data.rider_id !== req.user.id && data.driver_id !== req.user.id)) {
      return res.status(404).json({ error: "Ride not found" });
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { pickup, dropoff, ride_type = "standard" } = req.body;
    const c = [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng].map(toNum);

    if (!pickup?.address || !dropoff?.address || c.some((v) => v === null)) {
      return res.status(400).json({ error: "Pickup and drop-off are required" });
    }
    if (!RIDE_TYPES.includes(ride_type)) {
      return res.status(400).json({ error: "Invalid ride type" });
    }

    const { data: active } = await supabase
      .from("rides")
      .select("id")
      .eq("rider_id", req.user.id)
      .in("status", ["requested", "accepted", "in_progress"])
      .limit(1);
    if (active?.length) return res.status(409).json({ error: "You already have an active ride" });

    const fare = calculateFare(ride_type, roadDistanceKm(...c));

    const { data, error } = await supabase
      .from("rides")
      .insert({
        rider_id: req.user.id,
        pickup_address: pickup.address,
        pickup_lat: c[0],
        pickup_lng: c[1],
        dropoff_address: dropoff.address,
        dropoff_lat: c[2],
        dropoff_lng: c[3],
        ride_type,
        fare,
      })
      .select()
      .single();
    if (error) throw error;

    emitToDrivers("ride:new", data);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/cancel", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("rides")
      .update({ status: "cancelled" })
      .eq("id", req.params.id)
      .eq("rider_id", req.user.id)
      .in("status", ["requested", "accepted"])
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(400).json({ error: "This ride can't be cancelled" });

    emitToDrivers("ride:taken", { id: data.id });
    if (data.driver_id) {
      emitToUser(data.driver_id, "ride:updated", data);
      emitToUser(data.driver_id, "notification", { message: "The rider cancelled the ride" });
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;