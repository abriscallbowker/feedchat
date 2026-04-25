import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import summaryRouter from "./summary";
import analysisRouter from "./analysis";
import insightsRouter from "./insights";
import orgRouter from "./org";
import membersRouter from "./members";
import userRouter from "./user";
import conversationsRouter from "./conversations";
import analysisExportRouter from "./analysisExport";
import teamRouter from "./team";
import usageRouter from "./usage";
import chatTagRouter from "./chatTag";
import userCheckRouter from "./userCheck";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(summaryRouter);
router.use(analysisRouter);
router.use(analysisExportRouter);
router.use(insightsRouter);
router.use(orgRouter);
router.use(membersRouter);
router.use(teamRouter);
router.use(userRouter);
router.use(conversationsRouter);
router.use(usageRouter);
router.use(chatTagRouter);
router.use(userCheckRouter);

export default router;
