import { describe, it, expect, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { createServer, type ServerResult } from "../server.js";
import { EnvSigner } from "../signers/EnvSigner.js";
import { WalletStore } from "../wallet/store.js";

const HORIZON_URL = process.env.HORIZON_URL ?? "http://localhost:8000";
const RPC_URL = process.env.RPC_URL ?? "http://localhost:8000";

describe("Wallet Endpoints (Issue 1)", () => {
  const cosignerKeypair = Keypair.random();
  const feePayerKeypair = Keypair.random();
  const cosignerSigner = new EnvSigner(cosignerKeypair.secret());
  const feePayerSigner = new EnvSigner(feePayerKeypair.secret());
  const apiKey = "test-secret-api-key";

  let walletStore: WalletStore;

  beforeEach(() => {
    walletStore = new WalletStore();
    walletStore.clear();
  });

  it("stores and retrieves wallet records via WalletStore", () => {
    const id = "test-uuid-123";
    const address = Keypair.random().publicKey();
    const createdAt = new Date();

    walletStore.add({ id, address, createdAt });

    const retrieved = walletStore.get(id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.address).toBe(address);

    const list = walletStore.list(1, 10);
    expect(list.total).toBe(1);
    expect(list.data[0].id).toBe(id);

    walletStore.delete(id);
    expect(walletStore.get(id)).toBeUndefined();
  });
});
