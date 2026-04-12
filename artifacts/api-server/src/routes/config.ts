import { Router } from "express";
import { db } from "@workspace/db";
import { botConfigTable } from "@workspace/db";
import { UpdateConfigBody } from "@workspace/api-zod";

const router = Router();

router.get("/config", async (_req, res) => {
  const rows = await db.select().from(botConfigTable).limit(1);
  if (rows.length === 0) {
    const [cfg] = await db.insert(botConfigTable).values({}).returning();
    res.json({ ...cfg, updatedAt: cfg!.updatedAt.toISOString() });
    return;
  }
  const cfg = rows[0]!;
  res.json({ ...cfg, updatedAt: cfg.updatedAt.toISOString() });
});

router.put("/config", async (req, res) => {
  const parsed = UpdateConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const rows = await db.select().from(botConfigTable).limit(1);

  if (rows.length === 0) {
    const [cfg] = await db
      .insert(botConfigTable)
      .values({ ...parsed.data, updatedAt: new Date() })
      .returning();
    res.json({ ...cfg, updatedAt: cfg!.updatedAt.toISOString() });
    return;
  }

  const { id } = rows[0]!;
  const { eq } = await import("drizzle-orm");
  const [updated] = await db
    .update(botConfigTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(botConfigTable.id, id))
    .returning();

  res.json({ ...updated, updatedAt: updated!.updatedAt.toISOString() });
});

export default router;
