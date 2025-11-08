import { z } from 'zod'

export const PreferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  email_opt_in: z.boolean().default(false),
  units: z.enum(['imperial', 'metric']).default('imperial'),
  discovery_radius_km: z.number().min(1).max(50).default(10),
})

export type PreferencesInput = z.infer<typeof PreferencesSchema>


