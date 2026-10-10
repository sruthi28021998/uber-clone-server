import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { requireDbUser } from "../middleware/auth.js";
import { haversineKm } from "../lib/fare.js";
import { toNum } from "../lib/utils.js";
import { emitToUser, emitToDrivers } from "../lib/realtime.js";

const MATCH_RADIUS_KM = 10;
const NEXT_STATUS = { accepted: "in_progress", in_progress: "completed" };
const STATUS_MESSAGE = {
  in_progress: "Your ride has started",
  completed: "You have reached your destination",
};

const router = Router();

router.use(requireDbUser, (req, res, next) =>
  req.user.role === "driver"
    ? next()
    : res.status(403).json({ error: "Switch your role to Driver in Profile" })
);
router.param("id", (_req, res, next, id) =>
  isUuid(id) ? next() : res.status(404).json({ error: "Not found" })
);

// Go online/offline and update location
router.patch("/status", async (req, res, next) => {
  try {
    const { is_online, lat, lng } = req.body;
    const updates = {};
    if (typeof is_online === "boolean") updates.is_online = is_online;
    const la = toNum(lat);
    const ln = toNum(lng);
    if (la !== null && ln !== null) {
      updates.current_lat = la;
      updates.current_lng = ln;
    }

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", req.user.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Requested rides near the driver, closest first
router.get("/rides/available", async (req, res, next) => {
  try {
    const { is_online, current_lat, current_lng } = req.user;
    if (!is_online || current_lat == null || current_lng == null) return res.json([]);

    const { data, error } = await supabase
      .from("rides")
      .select("*, rider:users!rider_id(name, image_url)")
      .eq("status", "requested")
      .is("driver_id", null)
      .neq("rider_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const nearby = data
      .map((r) => ({
        ...r,
        distanceToPickupKm:
          Math.round(haversineKm(current_lat, current_lng, r.pickup_lat, r.pickup_lng) * 10) / 10,
      }))
      .filter((r) => r.distanceToPickupKm <= MATCH_RADIUS_KM)
      .sort((a, b) => a.distanceToPickupKm - b.distanceToPickupKm);

    res.json(nearby);
  } catch (err) {
    next(err);
  }
});

// The driver's current ride, if any
router.get("/rides/active", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("rides")
      .select("*, rider:users!rider_id(name, phone, image_url)")
      .eq("driver_id", req.user.id)
      .in("status", ["accepted", "in_progress"])
      .limit(1);
    if (error) throw error;
    res.json(data[0] ?? null);
  } catch (err) {
    next(err);
  }
});

router.patch("/rides/:id/accept", async (req, res, next) => {
  try {
    if (!req.user.is_online) return res.status(400).json({ error: "Go online first" });

    const { data: active } = await supabase
      .from("rides")
      .select("id")
      .eq("driver_id", req.user.id)
      .in("status", ["accepted", "in_progress"])
      .limit(1);
    if (active?.length) return res.status(409).json({ error: "Finish your current ride first" });

    // Only succeeds if the ride is still unassigned, so two drivers can't both get it
    const { data, error } = await supabase
      .from("rides")
      .update({ driver_id: req.user.id, status: "accepted" })
      .eq("id", req.params.id)
      .eq("status", "requested")
      .is("driver_id", null)
      .neq("rider_id", req.user.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: "Ride is no longer available" });

    emitToUser(data.rider_id, "ride:updated", data);
    emitToUser(data.rider_id, "notification", {
      message: `${req.user.name ?? "A driver"} accepted your ride`,
    });
    emitToDrivers("ride:taken", { id: data.id });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.patch("/rides/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body;

    const { data: ride, error: findError } = await supabase
      .from("rides")
      .select("*")
      .eq("id", req.params.id)
      .eq("driver_id", req.user.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (NEXT_STATUS[ride.status] !== status) {
      return res.status(400).json({ error: "Invalid status change" });
    }

    const { data, error } = await supabase
      .from("rides")
      .update({ status })
      .eq("id", ride.id)
      .eq("status", ride.status)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: "Ride was updated by someone else" });

    emitToUser(data.rider_id, "ride:updated", data);
    emitToUser(data.rider_id, "notification", { message: STATUS_MESSAGE[status] });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;