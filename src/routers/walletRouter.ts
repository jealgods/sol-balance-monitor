import { Router } from "express";
import {
  solPrice,
  getWalletSolBalance,
  getWalletLLCBalance,
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

export default router;
