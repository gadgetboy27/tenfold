import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import creditsRouter from "./credits.js";
import campaignsRouter from "./campaigns.js";
import jobsRouter from "./jobs.js";
import compositionsRouter from "./compositions.js";
import socialRouter from "./social.js";
import publishRouter from "./publish.js";
import promptRouter from "./prompt.js";
import webhooksRouter from "./webhooks.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(creditsRouter);
router.use(campaignsRouter);
router.use(jobsRouter);
router.use(compositionsRouter);
router.use(socialRouter);
router.use(publishRouter);
router.use(promptRouter);
router.use(webhooksRouter);

export default router;
