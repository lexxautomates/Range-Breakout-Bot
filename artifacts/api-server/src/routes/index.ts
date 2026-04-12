import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import botRouter from "./bot.js";
import sessionRouter from "./session.js";
import tradesRouter from "./trades.js";
import configRouter from "./config.js";
import accountRouter from "./account.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(sessionRouter);
router.use(tradesRouter);
router.use(configRouter);
router.use(accountRouter);

export default router;
