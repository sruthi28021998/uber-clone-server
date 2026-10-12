import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../src/config/supabase.js", () => ({ supabase: {} }));
vi.mock("../src/middleware/auth.js", () => ({
  requireDbUser: (req, _res, next) => {
    req.user = { id: "user-1", role: "rider", name: "Test" };
    next();
  },
}));

import usersRouter from "../src/routes/users.js";

const app = express();
app.use(express.json());
app.use("/api/users", usersRouter);

describe("PATCH /api/users/me validation", () => {
  it("rejects non-http picture links", async () => {
    const res = await request(app).patch("/api/users/me").send({ image_url: "javascript:alert(1)" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid phone numbers", async () => {
    const res = await request(app).patch("/api/users/me").send({ phone: "abc<script>" });
    expect(res.status).toBe(400);
  });

  it("rejects empty updates", async () => {
    const res = await request(app).patch("/api/users/me").send({});
    expect(res.status).toBe(400);
  });
});