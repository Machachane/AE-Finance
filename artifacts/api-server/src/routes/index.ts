import { Router, type IRouter } from "express";
import healthRouter from "./health";
import airlineResearchRouter from "./airline-research";

const router: IRouter = Router();

router.use(healthRouter);
router.use(airlineResearchRouter);

export default router;
