import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import botRouter from "./bot.js";
import botsRouter from "./bots.js";
import sessionRouter from "./session.js";
import tradesRouter from "./trades.js";
import configRouter from "./config.js";
import accountRouter from "./account.js";
import scannerRouter from "./scanner.js";
import newsRouter from "./news.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(botsRouter);
router.use(sessionRouter);
router.use(tradesRouter);
router.use(configRouter);
router.use(accountRouter);
router.use(scannerRouter);
router.use(newsRouter);

export default router;
