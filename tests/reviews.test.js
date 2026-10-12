import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../src/config/supabase.js", () => ({ supabase: {} }));
vi.mock("../src/middleware/auth.js", () => ({
  requireDbUser: (req, _res, next) => {
    req.user = { id: "user-1", role: "rider", name: "Test Rider" };
    next();
  },
}));

import reviewsRouter from "../src/routes/reviews.js";

const app = express();
app.use(express.json());
app.use("/api/reviews", reviewsRouter);

const RIDE = "123e4567-e89b-12d3-a456-426614174000";

describe("POST /api/reviews", () => {
  it("rejects an invalid ride id", async () => {
    const res = await request(app).post("/api/reviews").send({ ride_id: "x", rating: 5 });
    expect(res.status).toBe(400);
  });

  it("rejects ratings outside 1 to 5", async () => {
    const res = await request(app).post("/api/reviews").send({ ride_id: RIDE, rating: 6 });
    expect(res.status).toBe(400);
  });

  it("rejects fractional ratings", async () => {
    const res = await request(app).post("/api/reviews").send({ ride_id: RIDE, rating: 4.5 });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/reviews/driver/:id", () => {
  it("returns 404 for an invalid id", async () => {
    const res = await request(app).get("/api/reviews/driver/not-a-uuid");
    expect(res.status).toBe(404);
  });
});