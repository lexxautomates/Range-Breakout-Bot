import { pgTable, serial, text, real, integer, boolean, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const directionEnum = pgEnum("direction", ["long", "short"]);
export const outcomeEnum = pgEnum("outcome", ["win", "loss", "breakeven"]);

export const botInstancesTable = pgTable("bot_instances", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  generation: integer("generation").notNull().default(0),
  parentId: integer("parent_id"),
  configSnapshot: jsonb("config_snapshot").notNull().default({}),
  avgRMultiple: real("avg_r_multiple").notNull().default(0),
  totalTrades: integer("total_trades").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  stoppedAt: timestamp("stopped_at"),
});

export const insertBotInstanceSchema = createInsertSchema(botInstancesTable).omit({ id: true, createdAt: true });
export type InsertBotInstance = z.infer<typeof insertBotInstanceSchema>;
export type BotInstance = typeof botInstancesTable.$inferSelect;

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  botInstanceId: integer("bot_instance_id").references(() => botInstancesTable.id, { onDelete: "set null" }),
  direction: directionEnum("direction").notNull(),
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price").notNull(),
  stopPrice: real("stop_price").notNull(),
  targetPrice: real("target_price").notNull(),
  qty: integer("qty").notNull(),
  pnl: real("pnl").notNull(),
  rMultiple: real("r_multiple").notNull(),
  outcome: outcomeEnum("outcome").notNull(),
  entryTime: timestamp("entry_time").notNull(),
  exitTime: timestamp("exit_time").notNull(),
  exitReason: text("exit_reason"),
  orbHigh: real("orb_high"),
  orbLow: real("orb_low"),
  volumeRatio: real("volume_ratio"),
  date: text("date").notNull(),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({ id: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;

export const botConfigTable = pgTable("bot_config", {
  id: serial("id").primaryKey(),
  openingRangeMinutes: integer("opening_range_minutes").notNull().default(15),
  riskPercent: real("risk_percent").notNull().default(1.0),
  rewardRiskRatio: real("reward_risk_ratio").notNull().default(2.0),
  requireVolumeConfirmation: boolean("require_volume_confirmation").notNull().default(true),
  volumeMultiplier: real("volume_multiplier").notNull().default(1.5),
  trailingStopEnabled: boolean("trailing_stop_enabled").notNull().default(false),
  trailingStopActivationR: real("trailing_stop_activation_r").notNull().default(1.0),
  reEntryEnabled: boolean("re_entry_enabled").notNull().default(false),
  maxOrbWidthPercent: real("max_orb_width_percent").notNull().default(3.0),
  minOrbWidthPercent: real("min_orb_width_percent").notNull().default(0.1),
  breakoutWindowMinutes: integer("breakout_window_minutes").notNull().default(240),
  useModerateRisk: boolean("use_moderate_risk").notNull().default(false),
  evolutionThreshold: integer("evolution_threshold").notNull().default(5),
  autoStartTopN: integer("auto_start_top_n").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBotConfigSchema = createInsertSchema(botConfigTable).omit({ id: true, updatedAt: true });
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type BotConfig = typeof botConfigTable.$inferSelect;
