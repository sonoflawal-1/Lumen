import { describe, it, expect } from "vitest";
import { Keypair, TransactionBuilder, Operation, Asset, BASE_FEE } from "@stellar/stellar-sdk";
import { PolicyEngine } from "./engine.js";
import { createSpendLimitPolicy } from "./rules.js";

const DUMMY_ACCOUNT_ID = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

function createMockPaymentTx(destination: string, amount: string): any {
  return {
    operations: [
      {
        type: "payment",
        destination,
        amount,
      },
    ],
  };
}

describe("PolicyEngine Unit Tests", () => {
  it("approves transactions when no policy exists", () => {
    const engine = new PolicyEngine();
    const result = engine.evaluate({
      walletAddress: Keypair.random().publicKey(),
      transaction: createMockPaymentTx(DUMMY_ACCOUNT_ID, "10"),
    });

    expect(result.approved).toBe(true);
  });

  it("does not consume spend budget on per-tx limit rejections", () => {
    const engine = new PolicyEngine();
    const walletId = Keypair.random().publicKey();

    // maxPerTx: 10, maxDaily: 50
    const policy = createSpendLimitPolicy(walletId, "native", "10", "50");
    engine.addPolicy(policy);

    // 1. Send tx of 20 (exceeds maxPerTx 10) 5 times in a row
    for (let i = 0; i < 5; i++) {
      const res = engine.evaluate({
        walletAddress: walletId,
        transaction: createMockPaymentTx(DUMMY_ACCOUNT_ID, "20"),
      });
      expect(res.approved).toBe(false);
      expect(res.reason).toContain("exceeds per-tx limit");
    }

    // 2. Send tx of 5 (maxPerTx / 2). It should be approved because previous rejections didn't consume budget.
    const resValid = engine.evaluate({
      walletAddress: walletId,
      transaction: createMockPaymentTx(DUMMY_ACCOUNT_ID, "5"),
    });
    expect(resValid.approved).toBe(true);
  });

  it("does not consume daily budget when daily limit is exceeded", () => {
    const engine = new PolicyEngine();
    const walletId = Keypair.random().publicKey();

    // maxPerTx: 100, maxDaily: 50
    const policy = createSpendLimitPolicy(walletId, "native", "100", "50");
    engine.addPolicy(policy);

    // First spend 40 (approved, daily total = 40)
    const res1 = engine.evaluate({
      walletAddress: walletId,
      transaction: createMockPaymentTx(DUMMY_ACCOUNT_ID, "40"),
    });
    expect(res1.approved).toBe(true);

    // Try to spend 30 (total would be 70 > 50 -> rejected)
    const res2 = engine.evaluate({
      walletAddress: walletId,
      transaction: createMockPaymentTx(DUMMY_ACCOUNT_ID, "30"),
    });
    expect(res2.approved).toBe(false);
    expect(res2.reason).toContain("Daily spending");

    // Try to spend 10 (total would be 40 + 10 = 50 <= 50 -> approved)
    const res3 = engine.evaluate({
      walletAddress: walletId,
      transaction: createMockPaymentTx(DUMMY_ACCOUNT_ID, "10"),
    });
    expect(res3.approved).toBe(true);
  });

  it("supports commitOnApprove: false option", () => {
    const engine = new PolicyEngine();
    const walletId = Keypair.random().publicKey();

    const policy = createSpendLimitPolicy(walletId, "native", "100", "50");
    engine.addPolicy(policy);

    // Evaluate without committing
    const res1 = engine.evaluate({
      walletAddress: walletId,
      transaction: createMockPaymentTx(DUMMY_ACCOUNT_ID, "40"),
      commitOnApprove: false,
    });
    expect(res1.approved).toBe(true);

    // Next evaluation for 40 should still pass if first was not committed
    const res2 = engine.evaluate({
      walletAddress: walletId,
      transaction: createMockPaymentTx(DUMMY_ACCOUNT_ID, "40"),
      commitOnApprove: true,
    });
    expect(res2.approved).toBe(true);
  });
});
