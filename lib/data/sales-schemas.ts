import { z } from "zod";
import { SaleSchema } from "./sales"; // reuse existing SaleSchema

export const SalesResponseSchema = z.object({
  sales: z.array(SaleSchema),
  meta: z.record(z.any()).optional(),
});
export type SalesResponse = z.infer<typeof SalesResponseSchema>;

// Safe normalizer that accepts either array or object and returns the contract
export function normalizeSalesJson(json: unknown): { sales: unknown[]; meta?: Record<string, unknown> } {
  if (Array.isArray(json)) return { sales: json, meta: { shape: "array" } };
  if (json && typeof json === "object" && Array.isArray((json as any).sales)) {
    const { sales, ...rest } = json as any;
    return { sales, meta: { shape: "object", ...rest } };
  }
  return { sales: [], meta: { shape: "invalid" } };
}
