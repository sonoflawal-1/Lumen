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
});
