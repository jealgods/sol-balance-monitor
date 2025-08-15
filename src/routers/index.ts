import { Router } from "express";
import walletRouter from "./walletRouter";

const router: Router = Router();

router.use("/wallet", walletRouter);

export default router;
