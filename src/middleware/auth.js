import { getAuth, clerkClient } from "@clerk/express";
import { supabase } from "../config/supabase.js";

// Verifies the Clerk session and attaches the matching DB user to req.user
export async function requireDbUser(req, res, next) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { data: existing } = await supabase
      .from("users")
      .select("*")
      .eq("clerk_id", userId)
      .maybeSingle();

    if (existing) {
      req.user = existing;
      return next();
    }

    const c = await clerkClient.users.getUser(userId);
    const { data, error } = await supabase
      .from("users")
      .insert({
        clerk_id: userId,
        email: c.emailAddresses[0]?.emailAddress ?? null,
        name: [c.firstName, c.lastName].filter(Boolean).join(" ") || null,
        image_url: c.imageUrl,
      })
      .select()
      .single();

    if (error) throw error;
    req.user = data;
    next();
  } catch (err) {
    next(err);
  }
}