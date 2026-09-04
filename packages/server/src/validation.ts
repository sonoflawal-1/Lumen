import { z } from "zod";

export const CosignRequestSchema = z.object({
  xdr: z.string().min(1, "xdr is required"),
  walletAddress: z.string().startsWith("G", "walletAddress must be a valid Stellar public key"),
});

export const FeeBumpRequestSchema = z.object({
  xdr: z.string().min(1, "xdr is required"),
});

const SpendLimitSchema = z.object({
  type: z.literal("spend_limit"),
  asset: z.string().min(1, "asset is required"),
  maxPerTx: z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/, "maxPerTx must be a decimal string"),
  maxDaily: z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/, "maxDaily must be a decimal string"),
});

const VelocityRuleSchema = z.object({
  type: z.literal("velocity"),
  maxTransactions: z.number().int().positive("maxTransactions must be a positive integer"),
  windowMinutes: z.number().int().positive("windowMinutes must be a positive integer"),
});

const AllowlistRuleSchema = z.object({
  type: z.literal("allowlist"),
  destinations: z.array(z.string().startsWith("G", "destination must be a valid Stellar public key")).min(1, "At least one destination is required"),
});

const PolicyRuleSchema = z.discriminatedUnion("type", [
  SpendLimitSchema,
  VelocityRuleSchema,
  AllowlistRuleSchema,
]);

export const PolicyRequestSchema = z.object({
  walletId: z.string().regex(/^G[A-Z2-7]{55}$/, "walletId must be a valid Stellar public key"),
  rules: z.array(PolicyRuleSchema).min(1, "At least one rule is required"),
});

export type CosignRequest = z.infer<typeof CosignRequestSchema>;
export type FeeBumpRequest = z.infer<typeof FeeBumpRequestSchema>;
export type PolicyRequest = z.infer<typeof PolicyRequestSchema>;
