import { z } from "zod";

export const timeZoneSchema = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Pilih zona waktu yang valid.");
export const preferenceSchema = z
  .object({
    locale: z.enum(["en", "id"]).default("en"),
    reduceMotion: z.boolean().default(false),
    activityScope: z.enum(["workspace", "mine"]).default("workspace"),
    density: z.enum(["comfortable", "compact"]).default("comfortable"),
    sidebarCollapsed: z.boolean().default(false),
    theme: z.enum(["system", "light", "dark"]).default("system"),
    assignmentNotifications: z.boolean().default(true),
    commentNotifications: z.boolean().default(true),
  })
  .strict();
export type AccountPreferences = z.infer<typeof preferenceSchema>;
export const DEFAULT_PREFERENCES = preferenceSchema.parse({});
export const profileFields = z
  .object({
    name: z.string().trim().min(1).max(80),
    jobTitle: z.string().trim().max(100),
    bio: z.string().trim().max(500),
    timeZone: timeZoneSchema,
    avatarId: z.string().uuid().nullable(),
    preferences: preferenceSchema,
  })
  .strict();
export type AccountProfile = z.infer<typeof profileFields> & {
  version: number;
};
export const workspaceConfigurationSchema = z
  .object({
    defaultCurrency: z.enum(["IDR", "USD"]).default("IDR"),
    defaultPriority: z
      .enum(["none", "low", "medium", "high", "urgent"])
      .default("none"),
    sidebarWidth: z.number().int().min(264).max(360).default(296),
    contentWidth: z.enum(["wide", "comfortable"]).default("wide"),
    fontScale: z.enum(["standard", "large"]).default("standard"),
    workingDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .transform((v) => [...new Set(v)])
      .default([1, 2, 3, 4, 5]),
    readOnly: z.boolean().default(false),
    calendarEnabled: z.boolean().default(true),
    allowedInviteDomains: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .max(253)
          .regex(/^(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})?$/),
      )
      .max(20)
      .transform((values) => values.filter(Boolean))
      .default([]),
    activityWindowDays: z.enum(["30", "90", "365", "all"]).default("all"),
    activityPageSize: z.enum(["25", "50", "100"]).default("50"),
  })
  .strict();
export type WorkspaceConfiguration = z.infer<
  typeof workspaceConfigurationSchema
>;
export const workspaceFields = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500),
    accent: z.enum(["green", "violet", "blue", "orange", "pink"]),
    timeZone: timeZoneSchema,
    logoId: z.string().uuid().nullable(),
    configuration: workspaceConfigurationSchema.default(() =>
      workspaceConfigurationSchema.parse({}),
    ),
  })
  .strict();
export type WorkspaceSettings = z.infer<typeof workspaceFields> & {
  version: number;
};
export const DEFAULT_WORKSPACE: WorkspaceSettings = {
  name: "Evolve",
  description: "Private organization workspace",
  accent: "green",
  timeZone: "Asia/Jakarta",
  logoId: null,
  configuration: workspaceConfigurationSchema.parse({}),
  version: 1,
};
export function defaultProfile(name: string): AccountProfile {
  return {
    name,
    jobTitle: "",
    bio: "",
    timeZone: "Asia/Jakarta",
    avatarId: null,
    preferences: { ...DEFAULT_PREFERENCES },
    version: 1,
  };
}
