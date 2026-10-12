import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { requireDbUser } from "../middleware/auth.js";
import { isUuid } from "../lib/utils.js";
import { emitToUser } from "../lib/realtime.js";

const router = Router();
router.use(requireDbUser);

// Rider reviews the driver of a completed ride (one review per ride)
router.post("/", async (req, res, next) => {
  try {
    const { ride_id, rating, comment } = req.body;
    if (!isUuid(ride_id)) return res.status(400).json({ error: "Invalid ride" });

    const stars = Number(rating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ error: "Rating must be a whole number from 1 to 5" });
    }
    const text = typeof comment === "string" ? comment.trim().slice(0, 500) : "";

    const { data: ride, error } = await supabase
      .from("rides")
      .select("id, driver_id, status")
      .eq("id", ride_id)
      .eq("rider_id", req.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.status !== "completed" || !ride.driver_id) {
      return res.status(400).json({ error: "You can only review completed rides" });
    }

    const { data, error: insertError } = await supabase
      .from("reviews")
      .insert({
        ride_id,
        rider_id: req.user.id,
        driver_id: ride.driver_id,
        rating: stars,
        comment: text || null,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return res.status(409).json({ error: "You already reviewed this ride" });
      }
      throw insertError;
    }

    emitToUser(ride.driver_id, "notification", { message: `You received a ${stars}-star rating` });
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// Driver profile with average rating. Use "me" for your own profile.
router.get("/driver/:id", async (req, res, next) => {
  try {
    const id = req.params.id === "me" ? req.user.id : req.params.id;
    if (!isUuid(id)) return res.status(404).json({ error: "Driver not found" });

    const { data: driver, error } = await supabase
      .from("users")
      .select("id, name, image_url, role")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!driver || driver.role !== "driver") {
      return res.status(404).json({ error: "Driver not found" });
    }

    const { data: stats } = await supabase
      .from("driver_ratings")
      .select("avg_rating, review_count")
      .eq("driver_id", id)
      .maybeSingle();

    const { data: reviews, error: reviewError } = await supabase
      .from("reviews")
      .select("rating, comment, created_at, rider:users!rider_id(name)")
      .eq("driver_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (reviewError) throw reviewError;

    res.json({
      driver: { id: driver.id, name: driver.name, image_url: driver.image_url },
      average: stats ? Number(stats.avg_rating) : 0,
      reviewCount: stats ? Number(stats.review_count) : 0,
      reviews: reviews.map((r) => ({
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        riderName: (r.rider?.name ?? "Rider").split(" ")[0], // first name only
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;