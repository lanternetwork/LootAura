import { z } from 'zod'

/**
 * Schema for validating social links input
 * All fields are optional URLs
 */
export const SocialLinksSchema = z.object({
  facebook: z.string().url().optional().nullable(),
  instagram: z.string().url().optional().nullable(),
  twitter: z.string().url().optional().nullable(),
  tiktok: z.string().url().optional().nullable(),
}).strict() // Reject unknown fields

export type SocialLinksInput = z.infer<typeof SocialLinksSchema>

