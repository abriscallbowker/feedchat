import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes/index";
import { logger } from "./lib/logger";
import { corsMiddleware } from "./middlewares/cors";
import { generalApiLimiter } from "./middlewares/rateLimiter";

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
app.use(corsMiddleware);
app.use(generalApiLimiter);

// 10MB limit for the bulk summary endpoint only
app.use("/summary/all", express.json({ limit: "10mb" }));
app.use("/summary/all", express.urlencoded({ extended: true, limit: "10mb" }));

// 1MB limit for all other routes
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/", router);

export default app;
