import { Transaction } from "@stellar/stellar-sdk";
import type { Policy, PolicyRule } from "@lumen/types";

export interface EvaluateOpts {
  walletAddress: string;
  transaction: Transaction;
}

export interface EvaluateResult {
  approved: boolean;
  reason?: string;
}

export class PolicyEngine {
  private policies: Map<string, Policy> = new Map();

  addPolicy(policy: Policy): void {
    this.policies.set(policy.walletId, policy);
  }

  removePolicy(walletId: string): void {
    this.policies.delete(walletId);
  }

  getPolicy(walletId: string): Policy | undefined {
    return this.policies.get(walletId);
  }

  evaluate(opts: EvaluateOpts): EvaluateResult {
    const policy = this.policies.get(opts.walletAddress);

    if (!policy) {
      return { approved: true };
    }

    for (const rule of policy.rules) {
      const result = this.evaluateRule(rule, opts);
      if (!result.approved) {
        return result;
      }
    }

    return { approved: true };
  }

  private evaluateRule(rule: PolicyRule, opts: EvaluateOpts): EvaluateResult {
    switch (rule.type) {
      case "spend_limit":
        return this.evaluateSpendLimit(rule, opts);
      case "velocity":
        return { approved: true };
      case "allowlist":
        return this.evaluateAllowlist(rule, opts);
      default:
        return { approved: true };
    }
  }

  private evaluateSpendLimit(rule: import("@lumen/types").SpendLimit, opts: EvaluateOpts): EvaluateResult {
    return { approved: true };
  }

  private evaluateAllowlist(rule: import("@lumen/types").AllowlistRule, opts: EvaluateOpts): EvaluateResult {
    return { approved: true };
  }
}
