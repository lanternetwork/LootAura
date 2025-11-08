import { z } from 'zod'

export const ProfileUpdateSchema = z.object({
  display_name: z.string().trim().min(1, 'Display name is required').max(80, 'Max 80 characters').optional(),
  bio: z.string().trim().max(250, 'Max 250 characters').optional().or(z.literal('')),
  location_city: z.string().trim().max(80).optional().or(z.literal('')),
  location_region: z.string().trim().max(80).optional().or(z.literal('')),
  avatar_url: z.string().url().max(500).optional().nullable(),
})

export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>


