import dotenv from "dotenv";

dotenv.config();

export const config = {
  // Server configuration
  port: process.env["PORT"] || 8000,
  nodeEnv: process.env["NODE_ENV"] || "development",

  coingecko: {
    baseUrl: "https://api.coingecko.com/api/v3",
    timeout: 10000, // 10 seconds
  },
} as const;

export type Config = typeof config;
