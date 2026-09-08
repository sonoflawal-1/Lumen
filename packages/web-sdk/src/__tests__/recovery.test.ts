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
