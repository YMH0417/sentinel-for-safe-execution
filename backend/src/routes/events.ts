// backend/src/routes/events.ts — GET /events
import { Router, Request, Response } from "express";
import { getEvents, clearEvents } from "../services/eventService.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  res.json({ events: await getEvents() });
});

// Debug: 清空事件（测试用）
router.post("/clear", async (_req: Request, res: Response) => {
  await clearEvents();
  res.json({ message: "Events cleared" });
});

export default router;
