import { describe, it, expect, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { WalletStore } from "../wallet/store.js";

describe("WalletStore (Issue 2)", () => {
  let store: WalletStore;

  beforeEach(() => {
    store = new WalletStore();
  });

  it("stores and retrieves wallet by id and by address", () => {
    const id = "test-uuid-123";
    const address = Keypair.random().publicKey();
    const userDevicePublicKey = Keypair.random().publicKey();

    const record = {
      id,
      address,
      userDevicePublicKey,
      createdAt: new Date(),
    };

    store.addWallet(record);

    expect(store.getWallet(id)).toEqual(record);
    expect(store.getWalletByAddress(address)).toEqual(record);
  });

  it("lists wallets with pagination", () => {
    for (let i = 0; i < 5; i++) {
      const address = Keypair.random().publicKey();
      store.addWallet({
        id: `id-${i}`,
        address,
        userDevicePublicKey: address,
        createdAt: new Date(Date.now() + i * 1000),
      });
    }

    const page1 = store.listWallets(2);
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBe("id-1");

    const page2 = store.listWallets(2, page1.nextCursor);
    expect(page2.items).toHaveLength(2);
    expect(page2.items[0].id).toBe("id-2");
  });

  it("deletes wallet by id", () => {
    const id = "test-delete-id";
    const address = Keypair.random().publicKey();

    store.addWallet({
      id,
      address,
      userDevicePublicKey: address,
      createdAt: new Date(),
    });

    expect(store.deleteWallet(id)).toBe(true);
    expect(store.getWallet(id)).toBeUndefined();
    expect(store.getWalletByAddress(address)).toBeUndefined();
  });
});
