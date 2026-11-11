import { Router, type IRouter } from 'express';
import { db, feedbackTable } from '@workspace/db';
import { SubmitFeedbackBody, SubmitFeedbackResponse } from '@workspace/api-zod';
import type { FeedbackInput } from '@workspace/api-zod';

async function saveFeedback(input: FeedbackInput) {
  const [saved] = await db.insert(feedbackTable).values(input).returning({
    id: feedbackTable.id,
    createdAt: feedbackTable.createdAt,
  });
  if (!saved) throw new Error('Feedback insert returned no receipt');
  return saved;
}

export function createFeedbackRouter(
  save: typeof saveFeedback = saveFeedback,
): IRouter {
  const router: IRouter = Router();
  const windows = new Map<string, { expires: number; count: number }>();
  // Submissions are anonymous. Do not retain addresses, user agents, or feedback
  // text in request logs, and never expose a public reading endpoint.
  router.post('/feedback', async (req, res): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    const now = Date.now();
    for (const [key, entry] of windows) {
      if (entry.expires <= now) windows.delete(key);
    }
    const key = req.ip || 'unknown';
    const window = windows.get(key) ?? { expires: now + 600_000, count: 0 };
    if (window.count >= 10 || (!windows.has(key) && windows.size >= 10_000)) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((window.expires - now) / 1000))));
      res.status(429).json({ error: 'Too many submissions. Please wait a few minutes before trying again.' });
      return;
    }
    window.count += 1;
    windows.set(key, window);

    const parsed = SubmitFeedbackBody.safeParse(req.body);
    if (!parsed.success || !parsed.data.message.trim()) {
      res.status(400).json({ error: 'Choose a valid section and enter feedback of up to 5,000 characters.' });
      return;
    }
    try {
      const receipt = await save({ ...parsed.data, message: parsed.data.message.trim() });
      res.status(201).json(SubmitFeedbackResponse.parse(receipt));
    } catch {
      req.log.error({ category: 'feedback_save' }, 'Feedback could not be saved.');
      res.status(503).json({ error: 'Feedback could not be saved. Your message has not been cleared; please try again.' });
    }
  });
  return router;
}

export default createFeedbackRouter();
