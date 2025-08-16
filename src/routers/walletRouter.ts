import { Router } from "express";
import {
  solPrice,
  getWalletSolBalance,
  getWalletLLCBalance,
  calculateLLCPrice,
  calculateLLCPriceUSD,
  getLLCPricingInfo,
} from "../controllers/walletController";

const router: Router = Router();

// GET /api/wallet/sol-price
router.get("/sol-price", async (_req, res, next) => {
  try {
    const price = await solPrice();
    res.json({ price: price });
  } catch (error) {
    next(error);
  }
});

// GET /api/wallet/sol-balance
router.get("/sol-balance", async (_req, res, next) => {
  try {
    const balance = await getWalletSolBalance();
    res.json({ solBalance: balance });
  } catch (error) {
    next(error);
  }
});

// GET /api/wallet/llc-balance
router.get("/llc-balance", async (_req, res, next) => {
  try {
    const balance = await getWalletLLCBalance();
    res.json({ llcBalance: balance });
  } catch (error) {
    next(error);
  }
});

// GET /api/wallet/balances
router.get("/balances", async (_req, res, next) => {
  try {
    const [solBalance, llcBalance] = await Promise.all([
      getWalletSolBalance(),
      getWalletLLCBalance(),
    ]);

    res.json({
      solBalance,
      llcBalance,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/wallet/llc-price
router.get("/llc-price", async (_req, res, next) => {
  try {
    const llcPrice = await calculateLLCPrice();
    res.json({
      llcPrice,
      timestamp: new Date().toISOString(),
      description: "LLC price calculated as SOL balance / LLC balance ratio",
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/wallet/llc-price-usd
router.get("/llc-price-usd", async (_req, res, next) => {
  try {
    const llcPriceUSD = await calculateLLCPriceUSD();
    res.json({
      llcPriceUSD,
      timestamp: new Date().toISOString(),
      description:
        "LLC price in USD calculated as (SOL balance / LLC balance) * SOL price",
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/wallet/llc-ratio
router.get("/llc-ratio", async (_req, res, next) => {
  try {
    const pricingInfo = await getLLCPricingInfo();
    res.json({
      ratio: pricingInfo.ratio,
      llcPriceSOL: pricingInfo.llcPriceSOL,
      llcPriceUSD: pricingInfo.llcPriceUSD,
      solPriceUSD: pricingInfo.solPriceUSD,
      timestamp: new Date().toISOString(),
      description: "Complete LLC pricing ratio: 1 LLC = X SOL = Y USD",
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/wallet/pool-info
router.get("/pool-info", async (_req, res, next) => {
  try {
    const pricingInfo = await getLLCPricingInfo();

    res.json({
      solBalance: pricingInfo.solBalance,
      llcBalance: pricingInfo.llcBalance,
      llcPriceSOL: pricingInfo.llcPriceSOL,
      llcPriceUSD: pricingInfo.llcPriceUSD,
      solPriceUSD: pricingInfo.solPriceUSD,
      autoSwapEnabled: true,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
