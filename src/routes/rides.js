import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { requireDbUser } from "../middleware/auth.js";

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

export default router;