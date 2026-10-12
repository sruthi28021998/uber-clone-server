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

    if (typeof phone === "string") {
      const p = phone.trim();
      if (!/^[0-9+\-\s()]{0,20}$/.test(p)) {
        return res.status(400).json({ error: "Invalid phone number" });
      }
      updates.phone = p;
    }

    if (typeof image_url === "string") {
      const url = image_url.trim();
      if (url && !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: "Picture must be an http(s) link" });
      }
      updates.image_url = url.slice(0, 500);
    }

    if (role === "rider" || role === "driver") updates.role = role;

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "Nothing to update" });
    }

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