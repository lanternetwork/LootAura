import { z } from 'zod'

export const ProfileUpdateSchema = z.object({
  display_name: z.string().trim().min(1, 'Display name is required').max(60, 'Max 60 characters'),
  bio: z.string().trim().max(500, 'Max 500 characters').optional().or(z.literal('')),
  location_city: z.string().trim().max(80).optional().or(z.literal('')),
  location_region: z.string().trim().max(80).optional().or(z.literal('')),
  avatar_url: z.string().url().max(500).optional(),
})

export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>


