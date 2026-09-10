import { Transaction, Operation } from "@stellar/stellar-sdk";
import type {
  Policy,
  PolicyRule,
  SpendLimit,
  VelocityRule,
  AllowlistRule,
} from "@lumen/types";

export interface EvaluateOpts {
  walletAddress: string;
  transaction: Transaction;
  commitOnApprove?: boolean;
}

export interface EvaluateResult {
  approved: boolean;
  reason?: string;
}

export class PolicyEngine {
  private policies: Map<string, Policy> = new Map();

  // In-memory tracking for spend limit and velocity
  private readonly spendTracking: Map<
    string,
    Map<string, { dailyTotal: number; txCount: number }>
  > = new Map();
  private readonly velocityTracking: Map<string, number[]> = new Map();

  addPolicy(policy: Policy): void {
    this.policies.set(policy.walletId, policy);
  }

  removePolicy(walletId: string): void {
    this.policies.delete(walletId);
    this.spendTracking.delete(walletId);
    this.velocityTracking.delete(walletId);
  }

  getPolicy(walletId: string): Policy | undefined {
    return this.policies.get(walletId);
  }

  getAllPolicies(): Policy[] {
    return Array.from(this.policies.values());
  }

  evaluate(opts: EvaluateOpts): EvaluateResult {
    const policy = this.policies.get(opts.walletAddress);

    if (!policy) {
      return { approved: true };
    }

    const shouldCommit = opts.commitOnApprove ?? true;

    // Track pending mutations during dry-run
    const pendingSpendUpdates: Array<{
      walletAddress: string;
      today: string;
      dailyTotal: number;
      txCount: number;
    }> = [];

    const pendingVelocityUpdates: Array<{
      walletAddress: string;
      recentTxs: number[];
    }> = [];

    for (const rule of policy.rules) {
      const result = this.evaluateRuleDryRun(
        rule,
        opts,
        pendingSpendUpdates,
        pendingVelocityUpdates
      );
      if (!result.approved) {
        // Reject immediately without committing any pending mutations
        return result;
      }
    }

    // All rules passed: commit pending updates if commitOnApprove is enabled
    if (shouldCommit) {
      for (const update of pendingSpendUpdates) {
        if (!this.spendTracking.has(update.walletAddress)) {
          this.spendTracking.set(update.walletAddress, new Map());
        }
        const walletTrack = this.spendTracking.get(update.walletAddress)!;
        walletTrack.set(update.today, {
          dailyTotal: update.dailyTotal,
          txCount: update.txCount,
        });
      }

      for (const update of pendingVelocityUpdates) {
        this.velocityTracking.set(update.walletAddress, update.recentTxs);
      }
    }

    return { approved: true };
  }

  private evaluateRuleDryRun(
    rule: PolicyRule,
    opts: EvaluateOpts,
    pendingSpend: Array<{
      walletAddress: string;
      today: string;
      dailyTotal: number;
      txCount: number;
    }>,
    pendingVelocity: Array<{
      walletAddress: string;
      recentTxs: number[];
    }>
  ): EvaluateResult {
    switch (rule.type) {
      case "spend_limit":
        return this.dryRunSpendLimit(rule as SpendLimit, opts, pendingSpend);
      case "velocity":
        return this.dryRunVelocity(rule as VelocityRule, opts, pendingVelocity);
      case "allowlist":
        return this.evaluateAllowlist(rule as AllowlistRule, opts);
      default:
        return { approved: true };
    }
  }

  private dryRunSpendLimit(
    rule: SpendLimit,
    opts: EvaluateOpts,
    pendingSpend: Array<{
      walletAddress: string;
      today: string;
      dailyTotal: number;
      txCount: number;
    }>
  ): EvaluateResult {
    const { walletAddress } = opts;

    const paymentOp = opts.transaction.operations.find(
      (op): op is Operation.Payment => "amount" in op && "destination" in op
    ) as Operation.Payment | undefined;

    if (!paymentOp) {
      return { approved: true };
    }

    const txAmount = parseFloat(paymentOp.amount);

    // 1. Per-transaction limit check FIRST (no state mutation dependency)
    if (txAmount > parseFloat(rule.maxPerTx)) {
      return {
        approved: false,
        reason: `Transaction amount ${txAmount} exceeds per-tx limit ${rule.maxPerTx}`,
      };
    }

    const walletTrack = this.spendTracking.get(walletAddress);
    const today = new Date().toISOString().split("T")[0];
    const existingDayTrack = walletTrack?.get(today) ?? { dailyTotal: 0, txCount: 0 };

    const proposedDailyTotal = existingDayTrack.dailyTotal + txAmount;
    const proposedTxCount = existingDayTrack.txCount + 1;

    // 2. Daily limit check against proposed total
    if (proposedDailyTotal > parseFloat(rule.maxDaily)) {
      return {
        approved: false,
        reason: `Daily spending ${proposedDailyTotal} exceeds limit ${rule.maxDaily}`,
      };
    }

    // Stage pending update
    pendingSpend.push({
      walletAddress,
      today,
      dailyTotal: proposedDailyTotal,
      txCount: proposedTxCount,
    });

    return { approved: true };
  }

  private dryRunVelocity(
    rule: VelocityRule,
    opts: EvaluateOpts,
    pendingVelocity: Array<{
      walletAddress: string;
      recentTxs: number[];
    }>
  ): EvaluateResult {
    const { walletAddress } = opts;

    const existingTxs = this.velocityTracking.get(walletAddress) ?? [];
    const windowMs = rule.windowMinutes * 60 * 1000;
    const cutoff = Date.now() - windowMs;
    const recentTxs = existingTxs.filter((t) => t > cutoff);

    const proposedRecentTxs = [...recentTxs, Date.now()];

    if (proposedRecentTxs.length > rule.maxTransactions) {
      return {
        approved: false,
        reason: `Too many transactions (${proposedRecentTxs.length}) in ${rule.windowMinutes}-minute window (max: ${rule.maxTransactions})`,
      };
    }

    pendingVelocity.push({
      walletAddress,
      recentTxs: proposedRecentTxs,
    });

    return { approved: true };
  }

  private evaluateAllowlist(
    rule: AllowlistRule,
    opts: EvaluateOpts
  ): EvaluateResult {
    const paymentOp = opts.transaction.operations.find(
      (op): op is Operation.Payment => "amount" in op && "destination" in op
    ) as Operation.Payment | undefined;

    if (!paymentOp) {
      return { approved: true };
    }

    const destination = paymentOp.destination.toString();
    const allowed = rule.destinations.includes(destination);

    if (!allowed) {
      return {
        approved: false,
        reason: `Destination ${destination} is not on the allowlist`,
      };
    }

    return { approved: true };
  }
}