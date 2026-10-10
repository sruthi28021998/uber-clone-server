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

import ridesRouter from "../src/routes/rides.js";

const app = express();
app.use(express.json());
app.use("/api/rides", ridesRouter);

describe("GET /api/rides/estimate", () => {
  it("returns fares for valid coordinates", async () => {
    const res = await request(app).get("/api/rides/estimate?plat=0&plng=0&dlat=0&dlng=0");
    expect(res.status).toBe(200);
    expect(res.body.distanceKm).toBe(0);
    expect(res.body.fares.standard).toBe(2.5);
  });

  it("rejects missing coordinates", async () => {
    const res = await request(app).get("/api/rides/estimate");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/rides", () => {
  it("rejects an empty request", async () => {
    const res = await request(app).post("/api/rides").send({});
    expect(res.status).toBe(400);
  });

  it("rejects an unknown ride type", async () => {
    const res = await request(app)
      .post("/api/rides")
      .send({
        pickup: { address: "A", lat: 1, lng: 1 },
        dropoff: { address: "B", lat: 2, lng: 2 },
        ride_type: "flying",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid ride type");
  });
});

describe("GET /api/rides/:id", () => {
  it("returns 404 for an invalid id", async () => {
    const res = await request(app).get("/api/rides/not-a-uuid");
    expect(res.status).toBe(404);
  });
});