import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({ role: "rider" }));

vi.mock("../src/config/supabase.js", () => ({ supabase: {} }));
vi.mock("../src/lib/stripe.js", () => ({ stripe: {} }));
vi.mock("../src/middleware/auth.js", () => ({
  requireDbUser: (req, _res, next) => {
    req.user = { id: "user-1", role: state.role, name: "Test" };
    next();
  },
}));

import paymentsRouter from "../src/routes/payments.js";

const app = express();
app.use(express.json());
app.use("/api/payments", paymentsRouter);

beforeEach(() => {
  state.role = "rider";
});

describe("POST /api/payments/checkout", () => {
  it("rejects an invalid ride id", async () => {
    const res = await request(app).post("/api/payments/checkout").send({ ride_id: "x" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/payments/confirm", () => {
  it("rejects a missing session id", async () => {
    const res = await request(app).post("/api/payments/confirm").send({});
    expect(res.status).toBe(400);
  });

  it("rejects a session id that isn't from Stripe Checkout", async () => {
    const res = await request(app).post("/api/payments/confirm").send({ session_id: "abc" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/payments/earnings", () => {
  it("is for drivers only", async () => {
    const res = await request(app).get("/api/payments/earnings");
    expect(res.status).toBe(403);
  });
});