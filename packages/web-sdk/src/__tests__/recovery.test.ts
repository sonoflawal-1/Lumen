import { describe, it, expect, vi, afterEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { LumenClient, setupGlobalErrorHandler } from "../client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

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

  it("recovers a wallet after discarding the client and still enforces policy on send", async () => {
    const deviceKeypair = Keypair.random();
    const walletAddress = Keypair.random().publicKey();
    const destination = Keypair.random().publicKey();

    const walletRecord = {
      id: "persisted-wallet-789",
      address: walletAddress,
      userDevicePublicKey: deviceKeypair.publicKey(),
      createdAt: new Date().toISOString(),
    };

    // 1. Create a wallet with the first client instance.
    const firstClient = new LumenClient({
      sponsorSecret,
      serverPublicKey,
      serverUrl: "http://localhost:3000",
      apiKey: "test-api-key",
    });

    const created = await firstClient.createWallet({
      userDevicePublicKey: deviceKeypair.publicKey(),
    });
    expect(created).toBeDefined();
    expect(firstClient.getWallet(created.id)).toBeDefined();

    // 2. Throw away the first client (simulates a page refresh).
    firstClient.close();
    expect((firstClient as any).wallets.size).toBe(0);

    // 3. Construct a fresh client and recover the wallet from the server.
    const secondClient = new LumenClient({
      sponsorSecret,
      serverPublicKey,
      serverUrl: "http://localhost:3000",
      apiKey: "test-api-key",
    });

    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.endsWith("/wallets") && method === "GET") {
        return {
          ok: true,
          json: async () => ({ items: [walletRecord] }),
        } as any;
      }

      if (url.endsWith(`/wallets/${walletAddress}`) && method === "GET") {
        return {
          ok: true,
          json: async () => walletRecord,
        } as any;
      }

      if (url.endsWith("/payments") && method === "POST") {
        const body = JSON.parse(init?.body ?? "{}");
        // Server-side policy: reject payments above the per-tx limit.
        if (Number(body.amount) > 100) {
          return {
            ok: false,
            status: 403,
            json: async () => ({ error: "policy_violation" }),
          } as any;
        }
        return {
          ok: true,
          json: async () => ({ hash: "tx-hash-ok" }),
        } as any;
      }

      return { ok: false, status: 404, json: async () => ({}) } as any;
    });
    globalThis.fetch = fetchMock as any;

    const recovered = await secondClient.recoverWallets();
    expect(recovered).toHaveLength(1);
    expect(secondClient.getWallet(walletRecord.id)).toBeDefined();

    // 4. Look the wallet up by address.
    const lookedUp = await secondClient.lookupByAddress(walletAddress);
    expect(lookedUp?.id).toBe(walletRecord.id);
    expect(lookedUp?.userDevicePublicKey).toBe(deviceKeypair.publicKey());

    // 5. Send a payment within policy — succeeds.
    const wallet = secondClient.getWallet(walletRecord.id)!;
    const okResult = await wallet.send({
      destination,
      amount: "10",
    });
    expect(okResult).toBeDefined();

    // 6. Send a payment violating policy — still enforced after recovery.
    await expect(
      wallet.send({ destination, amount: "1000" }),
    ).rejects.toThrow();
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
