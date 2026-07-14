export interface Policy {
  id: string;
  walletId: string;
  rules: PolicyRule[];
  createdAt: Date;
}

export type PolicyRule = SpendLimit | VelocityRule | AllowlistRule;

export interface SpendLimit {
  type: "spend_limit";
  asset: string;
  maxPerTx: string;
  maxDaily: string;
}

export interface VelocityRule {
  type: "velocity";
  maxTransactions: number;
  windowMinutes: number;
}

export interface AllowlistRule {
  type: "allowlist";
  destinations: string[];
}
