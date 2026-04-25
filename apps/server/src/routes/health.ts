import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok" as const });
});

export default router;
