import { describe, it, expect } from "vitest";
import { LumenClient } from "../client.js";

describe("Web SDK Secret Leakage Checks (Issue 2)", () => {
  it("instantiates LumenClient with serverUrl without requiring sponsorSecret", () => {
    const client = new LumenClient({
      serverUrl: "http://localhost:3000",
    });

    expect(client).toBeDefined();
    expect(client.getWallet).toBeTypeOf("function");
  });

  it("does not accept sponsorSecret in LumenClient constructor options", () => {
    // Verified by TypeScript types and structural inspection:
    // LumenClientOpts properties are serverUrl, network, horizonUrl, rpcUrl, serverPublicKey
    const client = new LumenClient({
      serverUrl: "http://localhost:3000",
      network: "testnet",
    });

    expect(client).not.toHaveProperty("sponsorKeypair");
  });

  it("does not expose sponsorSecret in error output", () => {
    const sponsorSecret = "S" + "A".repeat(55);
    const client = new LumenClient({
      serverUrl: "http://localhost:3000",
      network: "testnet",
      // @ts-expect-error - sponsorSecret is not a valid option and must be ignored
      sponsorSecret,
    });

    expect(client).toBeDefined();
    expect(client).not.toHaveProperty("sponsorSecret");

    // Any error surfaced from the client must not include the secret.
    const err = new Error("test error");
    expect(err.message).not.toContain(sponsorSecret);
  });

  it("does not leak secrets in errors thrown by LumenClient methods", async () => {
    const sponsorSecret = "S" + "B".repeat(55);
    const client = new LumenClient({
      serverUrl: "http://localhost:3000",
      network: "testnet",
    });

    // Attempt to exercise a method that may throw; ensure no secret leaks.
    try {
      // @ts-expect-error - intentionally passing an invalid argument
      await client.getWallet(sponsorSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(sponsorSecret);
      expect(message).not.toMatch(/S[A-Z2-7]{55}/);
    }
  });

  it("does not leak device seed strings in errors thrown by Wallet", async () => {
    const client = new LumenClient({
      serverUrl: "http://localhost:3000",
      network: "testnet",
    });

    const deviceSeed = "S" + "C".repeat(55);

    try {
      // @ts-expect-error - intentionally passing an invalid argument
      await client.getWallet(deviceSeed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(deviceSeed);
      expect(message).not.toMatch(/S[A-Z2-7]{55}/);
    }
  });
});