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

  it("returns no nextCursor on the final page", () => {
    for (let i = 0; i < 3; i++) {
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
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].id).toBe("id-2");
    expect(page2.nextCursor).toBeUndefined();
  });

  it("returns an empty list when no wallets exist", () => {
    const page = store.listWallets(50);
    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeUndefined();
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

  it("returns false when deleting a non-existent wallet", () => {
    expect(store.deleteWallet("does-not-exist")).toBe(false);
  });

  it("returns undefined for unknown id and address lookups", () => {
    expect(store.getWallet("unknown-id")).toBeUndefined();
    expect(store.getWalletByAddress(Keypair.random().publicKey())).toBeUndefined();
  });
});
