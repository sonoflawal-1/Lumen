import { describe, it, expect } from "vitest";
import { NoopAuditLogger } from "../audit/logger.js";

describe("AuditLogger", () => {
  it("records audit events in memory using NoopAuditLogger", () => {
    const logger = new NoopAuditLogger();
    logger.log({
      event: "wallet.created",
      address: "GABC123",
      requestId: "req-1",
    });

    expect(logger.events).toHaveLength(1);
    expect(logger.events[0].event).toBe("wallet.created");
    expect(logger.events[0].requestId).toBe("req-1");
    expect(logger.events[0].timestamp).toBeDefined();
  });

  it("correctly logs cosign approved and rejected events", () => {
    const logger = new NoopAuditLogger();
    logger.log({
      event: "cosign.approved",
      walletId: "GWALLET1",
      txHash: "hash123",
      signerPublicKey: "GSIGNER",
      requestId: "req-2",
      sourceIp: "127.0.0.1",
    });

    logger.log({
      event: "cosign.rejected",
      walletId: "GWALLET2",
      signerPublicKey: "GSIGNER",
      reason: "Policy violation",
      requestId: "req-3",
      sourceIp: "127.0.0.1",
    });

    expect(logger.events).toHaveLength(2);
    expect(logger.events[0].event).toBe("cosign.approved");
    expect(logger.events[1].event).toBe("cosign.rejected");
  });

  it("clears recorded events", () => {
    const logger = new NoopAuditLogger();
    logger.log({
      event: "policy.created",
      policyId: "pol-1",
      walletId: "GWALLET",
      requestId: "req-4",
    });
    expect(logger.events).toHaveLength(1);

    logger.clear();
    expect(logger.events).toHaveLength(0);
  });
});
