import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({ role: "driver", online: true }));

vi.mock("../src/config/supabase.js", () => ({ supabase: {} }));
vi.mock("../src/middleware/auth.js", () => ({
  requireDbUser: (req, _res, next) => {
    req.user = {
      id: "driver-1",
      role: state.role,
      is_online: state.online,
      current_lat: 1,
      current_lng: 1,
      name: "Test Driver",
    };
    next();
  },
}));

import driversRouter from "../src/routes/drivers.js";

const app = express();
app.use(express.json());
app.use("/api/drivers", driversRouter);

const RIDE = "123e4567-e89b-12d3-a456-426614174000";

beforeEach(() => {
  state.role = "driver";
  state.online = true;
});

describe("driver routes", () => {
  it("blocks riders from driver routes", async () => {
    state.role = "rider";
    const res = await request(app).get("/api/drivers/rides/active");
    expect(res.status).toBe(403);
  });

  it("returns 404 for an invalid ride id when accepting", async () => {
    const res = await request(app).patch("/api/drivers/rides/not-a-uuid/accept");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an invalid ride id when changing status", async () => {
    const res = await request(app)
      .patch("/api/drivers/rides/not-a-uuid/status")
      .send({ status: "completed" });
    expect(res.status).toBe(404);
  });

  it("shows no requests while offline", async () => {
    state.online = false;
    const res = await request(app).get("/api/drivers/rides/available");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("stops an offline driver from accepting a ride", async () => {
    state.online = false;
    const res = await request(app).patch(`/api/drivers/rides/${RIDE}/accept`);
    expect(res.status).toBe(400);
  });
});