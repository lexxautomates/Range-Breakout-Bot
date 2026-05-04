import { Router } from "express";
import { db } from "@workspace/db";
import { botConfigTable } from "@workspace/db";
import { UpdateConfigBody } from "@workspace/api-zod";

const router = Router();

const SECRET_KEY_RE = /(key|secret|token|password)/i;

function redactSecrets<T extends Record<string, unknown>>(obj: T): T {
  const copy: Record<string, unknown> = { ...obj };
  for (const k of Object.keys(copy)) {
    if (SECRET_KEY_RE.test(k)) {
      // Don't leak anything that looks like a credential.
      copy[k] = null;
    }
  }
  return copy as T;
}

function containsSecretKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).filter((k) => SECRET_KEY_RE.test(k));
}

router.get("/config", async (_req, res) => {
  const rows = await db.select().from(botConfigTable).limit(1);
  if (rows.length === 0) {
    const [cfg] = await db.insert(botConfigTable).values({}).returning();
    res.json(redactSecrets({ ...cfg, updatedAt: cfg!.updatedAt.toISOString() }));
    return;
  }
  const cfg = rows[0]!;
  res.json(redactSecrets({ ...cfg, updatedAt: cfg.updatedAt.toISOString() }));
});

router.put("/config", async (req, res) => {
  const parsed = UpdateConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const attemptedSecretKeys = containsSecretKeys(parsed.data as unknown as Record<string, unknown>);
  if (attemptedSecretKeys.length > 0) {
    res.status(400).json({
      error: "Refusing to update secret fields via API",
      keys: attemptedSecretKeys,
    });
    return;
  }

  const rows = await db.select().from(botConfigTable).limit(1);

  if (rows.length === 0) {
    const [cfg] = await db
      .insert(botConfigTable)
      .values({ ...parsed.data, updatedAt: new Date() })
      .returning();
    res.json(redactSecrets({ ...cfg, updatedAt: cfg!.updatedAt.toISOString() }));
    return;
  }

  const { id } = rows[0]!;
  const { eq } = await import("drizzle-orm");
  const [updated] = await db
    .update(botConfigTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(botConfigTable.id, id))
    .returning();

  res.json(redactSecrets({ ...updated, updatedAt: updated!.updatedAt.toISOString() }));
});

export default router;
