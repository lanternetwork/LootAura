import { z } from 'zod'

export const ReportReasonSchema = z.enum(['fraud', 'prohibited_items', 'spam', 'harassment', 'other'])

export const ReportSaleSchema = z.object({
  reason: ReportReasonSchema,
  details: z.string().max(1000).optional().nullable(), // Cap free-form details at 1000 chars
})

export type ReportSaleInput = z.infer<typeof ReportSaleSchema>

