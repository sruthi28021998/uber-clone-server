import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { requireDbUser } from "../middleware/auth.js";
import { joinDrivers, leaveDrivers } from "../lib/realtime.js";

const router = Router();
router.use(requireDbUser);

router.get("/me", (req, res) => res.json(req.user));

router.patch("/me", async (req, res, next) => {
  try {
    const { name, phone, image_url, role } = req.body;
    const updates = {};
    if (typeof name === "string") updates.name = name.trim().slice(0, 100);
    if (typeof phone === "string") updates.phone = phone.trim().slice(0, 20);
    if (typeof image_url === "string") updates.image_url = image_url.trim();
    if (role === "rider" || role === "driver") updates.role = role;

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", req.user.id)
      .select()
      .single();
    if (error) throw error;

    if (updates.role === "driver") joinDrivers(req.user.id);
    else if (updates.role === "rider") leaveDrivers(req.user.id);

    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;