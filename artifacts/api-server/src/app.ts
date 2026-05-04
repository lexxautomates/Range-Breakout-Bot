import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requireApiAuth } from "./middleware/auth.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const dashboardOrigin = process.env.DASHBOARD_ORIGIN;
app.use(
  cors(
    dashboardOrigin
      ? {
          origin: dashboardOrigin,
          methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        }
      : {
          // If not set, disable browser cross-origin access (non-browser clients still work).
          origin: false,
        },
  ),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Protect all API routes (bots, config, broker endpoints, etc.)
app.use("/api", requireApiAuth, router);

export default app;
