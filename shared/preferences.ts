import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const OUTLINE_WIDTHS = { narrow: 220, normal: 280, wide: 340 } as const;

/** Layout choices stay on each device: a phone and a desktop want different panes. */
export const outlinePreferences = defineSettings({
  id: "layout",
  scope: "device",
  version: 1,
  schema: z.object({
    side: z.enum(["left", "right"]).default("left"),
    visible: z.boolean().default(true),
    width: z.enum(["narrow", "normal", "wide"]).default("normal"),
  }),
});
