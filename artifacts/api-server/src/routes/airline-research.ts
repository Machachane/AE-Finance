import { Router, type IRouter } from "express";
import {
  ResearchAirlinesBody,
  ResearchAirlinesResponse,
} from "@workspace/api-zod";
import {
  researchSecFinancials,
  supportedAirlineMetrics,
} from "../lib/sec-financials";

const router: IRouter = Router();
const supportedMetrics = new Set(supportedAirlineMetrics);

router.post("/airline-research", async (req, res): Promise<void> => {
  const parsed = ResearchAirlinesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const airlines = [
    ...new Set(
      parsed.data.airlines.map((name: string) => name.trim()).filter(Boolean),
    ),
  ];
  if (!airlines.length) {
    res.status(400).json({ error: "Enter at least one airline name." });
    return;
  }

  const unknownMetrics = parsed.data.metrics.filter(
    (metric: string) => !supportedMetrics.has(metric),
  );
  if (unknownMetrics.length) {
    res.status(400).json({
      error: `Unsupported metric selection: ${unknownMetrics.join(", ")}`,
    });
    return;
  }

  try {
    const result = await researchSecFinancials({
      airlines,
      metrics: [...new Set(parsed.data.metrics)],
      years: [...new Set(parsed.data.years)],
    });
    res.json(
      ResearchAirlinesResponse.parse({
        generatedAt: new Date(),
        rows: result.rows,
        coverageNotes: result.coverageNotes,
      }),
    );
  } catch (error) {
    req.log.error(
      { err: error instanceof Error ? error.message : "Unknown SEC error" },
      "Airline research request failed",
    );
    res.status(502).json({
      error:
        "Official SEC data could not be reached right now. Please retry shortly.",
    });
  }
});

export default router;
