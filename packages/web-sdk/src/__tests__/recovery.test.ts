import { describe, it, expect, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { LumenClient, setupGlobalErrorHandler } from "../client.js";

describe("LumenClient Recovery & Lifetime (Issues 3 & 4)", () => {
  const sponsorSecret = Keypair.random().secret();
  const serverPublicKey = Keypair.random().publicKey();

  it("disposes all wallets on client.close() / client.dispose()", () => {
    const client = new LumenClient({
      sponsorSecret,
      serverPublicKey,
    });

    (client as any).wallets.set("w1", { dispose: vi.fn() });
    (client as any).wallets.set("w2", { dispose: vi.fn() });

    client.close();

    expect((client as any).wallets.size).toBe(0);
  });

  it("triggers dispose on global uncaughtException", () => {
    const client = new LumenClient({
      sponsorSecret,
      serverPublicKey,
    });

    const disposeSpy = vi.spyOn(client, "dispose");
    const cleanup = setupGlobalErrorHandler(client);

    // Simulate process error event if on Node
    if (typeof process !== "undefined") {
      process.emit("uncaughtException" as any, new Error("Test Error"));
    }

    expect(disposeSpy).toHaveBeenCalled();
    cleanup();
  });

  it("recovers wallets via recoverWallets() from server mock", async () => {
    const client = new LumenClient({
      sponsorSecret,
      serverPublicKey,
      serverUrl: "http://localhost:3000",
      apiKey: "test-api-key",
    });

    const mockRecord = {
      id: "recovered-id-123",
      address: Keypair.random().publicKey(),
      userDevicePublicKey: Keypair.random().publicKey(),
      createdAt: new Date().toISOString(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [mockRecord] }),
    } as any);

    const recovered = await client.recoverWallets();

    expect(recovered).toHaveLength(1);
    expect(recovered[0].id).toBe("recovered-id-123");
    expect(client.getWallet("recovered-id-123")).toBeDefined();
  });

  it("recovers a wallet after client discard and still enforces policy on send", async () => {
    const deviceKeypair = Keypair.random();
    const walletAddress = Keypair.random().publicKey();

    // 1. Create a wallet with the original client.
    const originalClient = new LumenClient({
      sponsorSecret,
      serverPublicKey,
      serverUrl: "http://localhost:3000",
      apiKey: "test-api-key",
    });

    const created = await originalClient.createWallet({
      userDevicePublicKey: deviceKeypair.publicKey(),
      address: walletAddress,
    } as any);

    expect(created).toBeDefined();
    const walletId = created.id;

    // 2. Throw away the original client.
    originalClient.dispose();

    // 3. Construct a new client (simulating a page refresh).
    const refreshedClient = new LumenClient({
      sponsorSecret,
      serverPublicKey,
      serverUrl: "http://localhost:3000",
      apiKey: "test-api-key",
    });

    expect(refreshedClient.getWallet(walletId)).toBeUndefined();

    // 4. Recover wallets from the server registry.
    const mockRecord = {
      id: walletId,
      address: walletAddress,
      userDevicePublicKey: deviceKeypair.publicKey(),
      createdAt: new Date().toISOString(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [mockRecord] }),
    } as any);

    const recovered = await refreshedClient.recoverWallets();

    expect(recovered).toHaveLength(1);
    const recoveredWallet = refreshedClient.getWallet(walletId);
    expect(recoveredWallet).toBeDefined();

    // 5. Send a payment after recovery; the server still enforces policy.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: "policy_violation",
        message: "Payment exceeds per-transaction limit",
      }),
    } as any);

    await expect(
      recoveredWallet!.send({
        destination: Keypair.random().publicKey(),
        amount: "1000000",
        asset: "native",
      } as any),
    ).rejects.toThrow(/policy/i);

    refreshedClient.dispose();
  });

  it("looks up wallet by address via lookupByAddress()", async () => {
    const client = new LumenClient({
      sponsorSecret,
      serverPublicKey,
      serverUrl: "http://localhost:3000",
    });

    const mockAddress = Keypair.random().publicKey();
    const mockRecord = {
      id: "found-id-456",
      address: mockAddress,
      userDevicePublicKey: mockAddress,
      createdAt: new Date().toISOString(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockRecord,
    } as any);

    const result = await client.lookupByAddress(mockAddress);

    expect(result).toBeDefined();
    expect(result?.id).toBe("found-id-456");
    expect(result?.address).toBe(mockAddress);
  });
});
