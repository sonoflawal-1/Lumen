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

// Matches a Stellar secret seed (S followed by 55 base32 chars).
const SEED_PATTERN = /\bS[A-Z2-7]{55}\b/;

function expectNoSeedLeak(value: unknown) {
  const text =
    value instanceof Error
      ? `${value.name}: ${value.message}\n${value.stack ?? ""}`
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  expect(SEED_PATTERN.test(text)).toBe(false);
}

describe("Web SDK secret material never leaks into errors (Issue 49)", () => {
  it("sendPayment error messages never contain a secret seed", async () => {
    const client = new LumenClient({
      serverUrl: "http://localhost:3000",
      network: "testnet",
    });

    try {
      // Invalid destination forces an error path in the send flow.
      await client.sendPayment({
        from: "not-a-valid-public-key",
        to: "also-not-valid",
        amount: "1",
      });
      // If it unexpectedly resolves, there is nothing to leak.
    } catch (err) {
      expectNoSeedLeak(err);
    } finally {
      client.dispose();
    }
  });

  it("getBalance error messages never contain a secret seed", async () => {
    const client = new LumenClient({
      serverUrl: "http://localhost:3000",
      network: "testnet",
    });

    try {
      await client.getBalance("not-a-valid-public-key");
    } catch (err) {
      expectNoSeedLeak(err);
    } finally {
      client.dispose();
    }
  });

  it("createWallet error messages never contain a secret seed", async () => {
    const client = new LumenClient({
      serverUrl: "http://localhost:3000",
      network: "testnet",
    });

    try {
      await client.createWallet();
    } catch (err) {
      expectNoSeedLeak(err);
    } finally {
      client.dispose();
    }
  });
});

describe("Web SDK wallet disposal (Issue 49)", () => {
  it("clears the internal wallets map and disposes each wallet on dispose()", () => {
    const client = new LumenClient({
      serverUrl: "http://localhost:3000",
      network: "testnet",
    });

    const wallets = (client as unknown as { wallets: Map<string, unknown> }).wallets;
    expect(wallets).toBeInstanceOf(Map);

    // Seed the map with a fake wallet to verify disposal behaviour without
    // requiring network access.
    const disposed: string[] = [];
    const fakeWallet = {
      id: "fake-wallet-id",
      isDisposed: () => disposed.includes("fake-wallet-id"),
      dispose: () => {
        disposed.push("fake-wallet-id");
      },
    };
    wallets.set("fake-wallet-id", fakeWallet);

    client.dispose();

    expect(disposed).toContain("fake-wallet-id");
    expect(wallets.size).toBe(0);
  });

  it("close() is an alias for dispose() and clears the wallets map", () => {
    const client = new LumenClient({
      serverUrl: "http://localhost:3000",
      network: "testnet",
    });

    const wallets = (client as unknown as { wallets: Map<string, unknown> }).wallets;
    const disposed: string[] = [];
    wallets.set("fake-wallet-id", {
      id: "fake-wallet-id",
      isDisposed: () => disposed.includes("fake-wallet-id"),
      dispose: () => {
        disposed.push("fake-wallet-id");
      },
    });

    client.close();

    expect(disposed).toContain("fake-wallet-id");
    expect(wallets.size).toBe(0);
  });

  it("each wallet reports isDisposed() after client disposal", () => {
    const client = new LumenClient({
      serverUrl: "http://localhost:3000",
      network: "testnet",
    });

    const wallets = (client as unknown as { wallets: Map<string, unknown> }).wallets;
    let isDisposed = false;
    const fakeWallet = {
      id: "fake-wallet-id",
      isDisposed: () => isDisposed,
      dispose: () => {
        isDisposed = true;
      },
    };
    wallets.set("fake-wallet-id", fakeWallet);

    expect(fakeWallet.isDisposed()).toBe(false);
    client.dispose();
    expect(fakeWallet.isDisposed()).toBe(true);
  });
});