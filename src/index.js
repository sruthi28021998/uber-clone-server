import "dotenv/config";
import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import usersRouter from "./routes/users.js";
import ridesRouter from "./routes/rides.js";
import driversRouter from "./routes/drivers.js";

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());
app.use(clerkMiddleware());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/users", usersRouter);
app.use("/api/rides", ridesRouter);
app.use("/api/drivers", driversRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));