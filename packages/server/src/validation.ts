import { z } from "zod";

export const CosignRequestSchema = z.object({
  xdr: z.string().min(1, "xdr is required"),
  walletAddress: z.string().startsWith("G", "walletAddress must be a valid Stellar public key"),
});

export const FeeBumpRequestSchema = z.object({
  xdr: z.string().min(1, "xdr is required"),
});

export const PolicyRequestSchema = z.object({
  walletId: z.string().min(1, "walletId is required"),
  rules: z.array(z.object({
    type: z.enum(["spend_limit", "velocity", "allowlist"]),
  })).min(1, "At least one rule is required"),
});

export type CosignRequest = z.infer<typeof CosignRequestSchema>;
export type FeeBumpRequest = z.infer<typeof FeeBumpRequestSchema>;
export type PolicyRequest = z.infer<typeof PolicyRequestSchema>;
