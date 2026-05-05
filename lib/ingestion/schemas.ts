import { z } from 'zod'
import { isAllowedImageUrl } from '@/lib/images/validateImageUrl'
import { FAILURE_REASONS } from '@/lib/ingestion/types'

export const FailureReasonSchema = z.enum(FAILURE_REASONS)

export const RawExternalSaleSchema = z.object({
  sourcePlatform: z.string().min(1),
  sourceUrl: z.string().url(),
  externalId: z.string().max(255).nullable(),
  title: z.string().max(500).nullable(),
  description: z.string().max(20000).nullable(),
  addressRaw: z.string().max(1000).nullable(),
  dateRaw: z.union([z.string(), z.number()]).nullable(),
  imageSourceUrl: z.string().url().max(2048).nullable(),
  rawPayload: z.unknown(),
  cityHint: z.string().min(1).max(100),
  stateHint: z.string().min(1).max(100),
})

export const ManualUploadSchema = z
  .array(RawExternalSaleSchema)
  .min(1, 'At least one sale is required')
  .max(500, 'Maximum 500 sales per upload')

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

const TimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Expected HH:MM or HH:MM:SS')
  .refine((value: string): boolean => {
    const parts = value.split(':')
    const minutes = Number.parseInt(parts[1] || '0', 10)
    return Number.isFinite(minutes) && minutes % 30 === 0
  }, 'Time must be in 30-minute increments')

const ImageUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value: string): boolean => isAllowedImageUrl(value), {
    message: 'Image URL must be an allowed Cloudinary upload URL',
  })

export const PublishInputSchema = z.object({
  ownerId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(10000).nullable(),
  address: z.string().max(500).nullable(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  zipCode: z.string().max(20).nullable(),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  dateStart: DateOnlySchema,
  dateEnd: DateOnlySchema.nullable(),
  timeStart: TimeSchema,
  timeEnd: TimeSchema.nullable(),
  coverImageUrl: ImageUrlSchema.nullable(),
  images: z.array(ImageUrlSchema).max(20).nullable(),
  importSource: z.string().min(1).max(100),
  externalSourceUrl: z.string().url().max(2048),
  ingestedSaleId: z.string().uuid(),
})

export type RawExternalSaleInput = z.infer<typeof RawExternalSaleSchema>
export type ManualUploadInput = z.infer<typeof ManualUploadSchema>
export type PublishInputValidated = z.infer<typeof PublishInputSchema>

