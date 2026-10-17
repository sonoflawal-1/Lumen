import { describe, it, expect, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { WalletStore } from "../wallet/store.js";
import { createWalletRouter } from "../wallet/routes.js";

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

describe("wallet endpoints (Issue 2)", () => {
  const API_KEY = "test-api-key";
  let store: WalletStore;
  let app: ReturnType<typeof createWalletRouter>;

  beforeEach(() => {
    store = new WalletStore();
    app = createWalletRouter({ store, apiKey: API_KEY });
  });

  async function request(
    method: string,
    path: string,
    opts: { headers?: Record<string, string>; body?: unknown } = {},
  ) {
    const res = await app.request(path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(opts.headers ?? {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const json = await res.json().catch(() => undefined);
    return { status: res.status, json };
  }

  it("POST /wallet/create returns { id, address, userDevicePublicKey }", async () => {
    const userDevicePublicKey = Keypair.random().publicKey();
    const { status, json } = await request("POST", "/wallet/create", {
      headers: { "x-user-device-public-key": userDevicePublicKey },
    });

    expect(status).toBe(201);
    expect(json.id).toBeTruthy();
    expect(json.address).toMatch(/^G[A-Z0-9]{55}$/);
    expect(json.userDevicePublicKey).toBe(userDevicePublicKey);

    const stored = store.getWallet(json.id);
    expect(stored).toBeDefined();
    expect(stored!.address).toBe(json.address);
    expect(stored!.userDevicePublicKey).toBe(userDevicePublicKey);
  });

  it("GET /wallet/:id returns the record and 404 for unknown ids", async () => {
    const created = await request("POST", "/wallet/create", {
      headers: { "x-user-device-public-key": Keypair.random().publicKey() },
    });

    const found = await request("GET", `/wallet/${created.json.id}`, {
      headers: { "x-api-key": API_KEY },
    });
    expect(found.status).toBe(200);
    expect(found.json.id).toBe(created.json.id);
    expect(found.json.address).toBe(created.json.address);
    expect(found.json.userDevicePublicKey).toBe(created.json.userDevicePublicKey);

    const missing = await request("GET", "/wallet/does-not-exist", {
      headers: { "x-api-key": API_KEY },
    });
    expect(missing.status).toBe(404);
  });

  it("GET /wallet/by-address/:address returns the record", async () => {
    const created = await request("POST", "/wallet/create", {
      headers: { "x-user-device-public-key": Keypair.random().publicKey() },
    });

    const found = await request("GET", `/wallet/by-address/${created.json.address}`, {
      headers: { "x-api-key": API_KEY },
    });
    expect(found.status).toBe(200);
    expect(found.json.id).toBe(created.json.id);

    const missing = await request(
      "GET",
      `/wallet/by-address/${Keypair.random().publicKey()}`,
      { headers: { "x-api-key": API_KEY } },
    );
    expect(missing.status).toBe(404);
  });

  it("GET /wallets pages results with limit and cursor", async () => {
    for (let i = 0; i < 3; i++) {
      await request("POST", "/wallet/create", {
        headers: { "x-user-device-public-key": Keypair.random().publicKey() },
      });
    }

    const page1 = await request("GET", "/wallets?limit=2", {
      headers: { "x-api-key": API_KEY },
    });
    expect(page1.status).toBe(200);
    expect(page1.json.items).toHaveLength(2);
    expect(page1.json.nextCursor).toBeTruthy();

    const page2 = await request(
      "GET",
      `/wallets?limit=2&cursor=${page1.json.nextCursor}`,
      { headers: { "x-api-key": API_KEY } },
    );
    expect(page2.status).toBe(200);
    expect(page2.json.items).toHaveLength(1);
    expect(page2.json.nextCursor).toBeNull();
  });

  it("DELETE /wallet/:id removes the record", async () => {
    const created = await request("POST", "/wallet/create", {
      headers: { "x-user-device-public-key": Keypair.random().publicKey() },
    });

    const deleted = await request("DELETE", `/wallet/${created.json.id}`, {
      headers: { "x-api-key": API_KEY },
    });
    expect(deleted.status).toBe(200);

    expect(store.getWallet(created.json.id)).toBeUndefined();
    expect(store.getWalletByAddress(created.json.address)).toBeUndefined();

    const missing = await request("DELETE", `/wallet/${created.json.id}`, {
      headers: { "x-api-key": API_KEY },
    });
    expect(missing.status).toBe(404);
  });

  it("API-key gated paths return 401 without a key", async () => {
    const created = await request("POST", "/wallet/create", {
      headers: { "x-user-device-public-key": Keypair.random().publicKey() },
    });

    const paths: Array<[string, string]> = [
      ["GET", `/wallet/${created.json.id}`],
      ["GET", `/wallet/by-address/${created.json.address}`],
      ["GET", "/wallets"],
      ["DELETE", `/wallet/${created.json.id}`],
    ];

    for (const [method, path] of paths) {
      const res = await request(method, path);
      expect(res.status).toBe(401);
    }
  });
});
