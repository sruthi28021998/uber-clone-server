import "dotenv/config";
import "./config/env.js";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { clerkMiddleware } from "@clerk/express";
import usersRouter from "./routes/users.js";
import ridesRouter from "./routes/rides.js";
import driversRouter from "./routes/drivers.js";
import paymentsRouter from "./routes/payments.js";
import receiptsRouter from "./routes/receipts.js";
import reviewsRouter from "./routes/reviews.js";
import { initSocket } from "./socket.js";

const app = express();
const isProd = process.env.NODE_ENV === "production";

if (isProd) app.set("trust proxy", 1); // correct client IPs behind a host like Render

const origins = process.env.CLIENT_URL.split(",").map((s) => s.trim());

app.use(helmet());
app.use(compression());
app.use(cors({ origin: origins }));
app.use(express.json({ limit: "10kb" }));
app.use(clerkMiddleware());

const limiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  });

app.use("/api", limiter(1000));
app.get("/", (_req, res) => res.json({ name: "RideNow API", status: "running" }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/users", usersRouter);
app.use("/api/rides", ridesRouter);
app.use("/api/drivers", driversRouter);
app.use("/api/payments", limiter(60), paymentsRouter);
app.use("/api/receipts", limiter(60), receiptsRouter);
app.use("/api/reviews", limiter(60), reviewsRouter);

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: isProd ? "Server error" : err.message || "Server error" });
});

const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));