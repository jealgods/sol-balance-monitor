import express from "express";
import dotenv from "dotenv";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { corsMiddleware } from "./middleware/cors";
import apiRouter from "./routers";
import { startWalletMonitoring } from "./controllers/walletController";

dotenv.config();

const app = express();
const port = process.env["PORT"] || 8000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(corsMiddleware);

// Routes
app.get("/", (_req, res) => {
  res.json({
    message: "Pool Monitor API",
    version: "1.0.0",
  });
});

// API routes
app.use("/api", apiRouter);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server and initialize services
app.listen(port, async () => {
  console.log(`🚀 Server running on http://localhost:${port}`);

  // Start wallet monitoring service
  await startWalletMonitoring();
});
