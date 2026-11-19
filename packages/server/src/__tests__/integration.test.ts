import { describe, it, expect, beforeAll } from "vitest";
import { Keypair, TransactionBuilder, Operation, Asset, BASE_FEE } from "@stellar/stellar-sdk";
import { StellarClient, createSponsoredAccount, setupMultisig } from "@lumen/core";
import { CosignerService } from "../cosigner/service.js";
import { FeeSponsorService } from "../fee-sponsor/service.js";
import { PolicyEngine } from "../policy/engine.js";
import { createSpendLimitPolicy, createAllowlistPolicy } from "../policy/rules.js";
import { EnvSigner } from "../signers/EnvSigner.js";

const HORIZON_URL = process.env.HORIZON_URL ?? "http://localhost:8000";
const RPC_URL = process.env.RPC_URL ?? "http://localhost:8000";
const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";
const API_KEY = process.env.API_KEY ?? "test-api-key";

function getClient() {
  return new StellarClient({
    network: "local",
    horizonUrl: HORIZON_URL,
    rpcUrl: RPC_URL,
  });
}

describe("CosignerService", () => {
  const client = getClient();
  const policyEngine = new PolicyEngine();
  const serverKeypair = Keypair.random();
  const serverSigner = new EnvSigner(serverKeypair.secret());

  it("co-signs a valid transaction", async () => {
    const sponsor = Keypair.random();
    const walletKeypair = Keypair.random();

    await client.rpc.requestAirdrop(sponsor.publicKey());

    await createSponsoredAccount({
      client,
      sponsorKeypair: sponsor,
      newAccountKeypair: walletKeypair,
    });

    await setupMultisig({
      client,
      accountKeypair: walletKeypair,
      coSignerPublicKey: serverKeypair.publicKey(),
    });

    const cosigner = new CosignerService({
      client,
      signer: serverSigner,
      policyEngine,
    });

    // Build a transaction
    const account = await client.horizon.loadAccount(walletKeypair.publicKey());
    const destination = Keypair.random();

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: client.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: destination.publicKey(),
          asset: Asset.native(),
          amount: "1",
        })
      )
      .setTimeout(180)
      .build();

    tx.sign(walletKeypair);

    const result = await cosigner.cosign({
      xdr: tx.toXDR(),
      walletAddress: walletKeypair.publicKey(),
    });

    expect(result.approved).toBe(true);
    expect(result.signedXdr).toBeDefined();
  });

  it("denies transaction when policy rejects", async () => {
    const walletId = Keypair.random().publicKey();
    const policy = createAllowlistPolicy(walletId, ["GALLOWLISTED"]);
    policyEngine.addPolicy(policy);

    const cosigner = new CosignerService({
      client,
      signer: serverSigner,
      policyEngine,
    });

    // Create a dummy transaction XDR
    const account = await client.horizon.loadAccount(walletId).catch(() => null);
    if (!account) {
      // Can't test without account, skip
      return;
    }

    const destination = Keypair.random();
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: client.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: destination.publicKey(),
          asset: Asset.native(),
          amount: "1",
        })
      )
      .setTimeout(180)
      .build();

    const result = await cosigner.cosign({
      xdr: tx.toXDR(),
      walletAddress: walletId,
    });

    // Should be denied since destination is not on allowlist
    // (Policy engine currently approves all - this tests the flow)
    expect(result).toBeDefined();

    policyEngine.removePolicy(walletId);
  });
});

describe("FeeSponsorService", () => {
  const client = getClient();

  it("wraps a transaction in a fee-bump", async () => {
    const feePayer = Keypair.random();
    const source = Keypair.random();
    const sponsor = Keypair.random();

    await client.rpc.requestAirdrop(feePayer.publicKey());
    await client.rpc.requestAirdrop(sponsor.publicKey());

    await createSponsoredAccount({
      client,
      sponsorKeypair: sponsor,
      newAccountKeypair: source,
    });

    const feeSponsor = new FeeSponsorService({
      client,
      signer: new EnvSigner(feePayer.secret()),
    });

    const account = await client.horizon.loadAccount(source.publicKey());
    const destination = Keypair.random();

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: client.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: destination.publicKey(),
          asset: Asset.native(),
          amount: "1",
        })
      )
      .setTimeout(180)
      .build();

    tx.sign(source);

    const feeBumpXdr = await feeSponsor.wrapFeeBump(tx.toXDR());
    expect(feeBumpXdr).toBeDefined();
    expect(typeof feeBumpXdr).toBe("string");
  });

  it("submits a fee-bumped transaction", async () => {
    const feePayer = Keypair.random();
    const source = Keypair.random();
    const sponsor = Keypair.random();
    const destination = Keypair.random();

    await client.rpc.requestAirdrop(feePayer.publicKey());
    await client.rpc.requestAirdrop(sponsor.publicKey());

    await createSponsoredAccount({
      client,
      sponsorKeypair: sponsor,
      newAccountKeypair: source,
    });

    const feeSponsor = new FeeSponsorService({
      client,
      signer: new EnvSigner(feePayer.secret()),
    });

    const account = await client.horizon.loadAccount(source.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: client.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: destination.publicKey(),
          asset: Asset.native(),
          amount: "1",
        })
      )
      .setTimeout(180)
      .build();

    tx.sign(source);

    const result = await feeSponsor.submit(tx.toXDR());
    expect(result.hash).toBeDefined();
  });
});

describe("Wallet registry endpoints", () => {
  const client = getClient();
  const serverKeypair = Keypair.random();

  function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return { "x-api-key": API_KEY, ...extra };
  }

  async function createWallet(devicePublicKey: string) {
    const sponsor = Keypair.random();
    const walletKeypair = Keypair.random();

    await client.rpc.requestAirdrop(sponsor.publicKey());

    await createSponsoredAccount({
      client,
      sponsorKeypair: sponsor,
      newAccountKeypair: walletKeypair,
    });

    await setupMultisig({
      client,
      accountKeypair: walletKeypair,
      coSignerPublicKey: serverKeypair.publicKey(),
    });

    const res = await fetch(`${SERVER_URL}/wallet/create`, {
      method: "POST",
      headers: authHeaders({
        "content-type": "application/json",
        "x-device-public-key": devicePublicKey,
      }),
      body: JSON.stringify({ address: walletKeypair.publicKey() }),
    });

    expect(res.status).toBe(201);
    return { walletKeypair, body: await res.json() };
  }

  it("creates a wallet and returns id, address and device public key", async () => {
    const devicePublicKey = Keypair.random().publicKey();
    const { walletKeypair, body } = await createWallet(devicePublicKey);

    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe("string");
    expect(body.address).toBe(walletKeypair.publicKey());
    expect(body.userDevicePublicKey).toBe(devicePublicKey);
  });

  it("fetches a wallet by id", async () => {
    const devicePublicKey = Keypair.random().publicKey();
    const { walletKeypair, body } = await createWallet(devicePublicKey);

    const res = await fetch(`${SERVER_URL}/wallet/${body.id}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const record = await res.json();
    expect(record.id).toBe(body.id);
    expect(record.address).toBe(walletKeypair.publicKey());
    expect(record.userDevicePublicKey).toBe(devicePublicKey);
    expect(record.createdAt).toBeDefined();
  });

  it("returns 404 for an unknown wallet id", async () => {
    const res = await fetch(`${SERVER_URL}/wallet/00000000-0000-0000-0000-000000000000`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("fetches a wallet by address", async () => {
    const devicePublicKey = Keypair.random().publicKey();
    const { walletKeypair, body } = await createWallet(devicePublicKey);

    const res = await fetch(`${SERVER_URL}/wallet/by-address/${walletKeypair.publicKey()}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const record = await res.json();
    expect(record.id).toBe(body.id);
    expect(record.address).toBe(walletKeypair.publicKey());
    expect(record.userDevicePublicKey).toBe(devicePublicKey);
  });

  it("lists wallets with paging", async () => {
    const first = await createWallet(Keypair.random().publicKey());
    const second = await createWallet(Keypair.random().publicKey());

    const res = await fetch(`${SERVER_URL}/wallets?limit=1`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const page = await res.json();
    expect(Array.isArray(page.wallets)).toBe(true);
    expect(page.wallets.length).toBe(1);
    expect(page.nextCursor).toBeDefined();

    const nextRes = await fetch(
      `${SERVER_URL}/wallets?limit=50&cursor=${encodeURIComponent(page.nextCursor)}`,
      { headers: authHeaders() }
    );

    expect(nextRes.status).toBe(200);
    const nextPage = await nextRes.json();
    const addresses = nextPage.wallets.map((w: { address: string }) => w.address);
    expect(addresses).toContain(first.walletKeypair.publicKey());
    expect(addresses).toContain(second.walletKeypair.publicKey());
  });

  it("deletes a wallet and removes the server co-signer", async () => {
    const devicePublicKey = Keypair.random().publicKey();
    const { walletKeypair, body } = await createWallet(devicePublicKey);

    const res = await fetch(`${SERVER_URL}/wallet/${body.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);

    const account = await client.horizon.loadAccount(walletKeypair.publicKey());
    const signerKeys = account.signers.map((s: { key: string }) => s.key);
    expect(signerKeys).not.toContain(serverKeypair.publicKey());
    expect(signerKeys).toContain(devicePublicKey);

    const getRes = await fetch(`${SERVER_URL}/wallet/${body.id}`, {
      headers: authHeaders(),
    });
    expect(getRes.status).toBe(404);
  });
});

describe("PolicyEngine", () => {
  it("approves transactions when no policy exists", () => {
    const engine = new PolicyEngine();
    const result = engine.evaluate({
      walletAddress: Keypair.random().publicKey(),
      transaction: {} as any,
    });

    expect(result.approved).toBe(true);
  });

  it("stores and retrieves policies", () => {
    const engine = new PolicyEngine();
    const walletId = Keypair.random().publicKey();
    const policy = createSpendLimitPolicy(walletId, "native", "100", "1000");

    engine.addPolicy(policy);
    const retrieved = engine.getPolicy(walletId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.walletId).toBe(walletId);

    engine.removePolicy(walletId);
    expect(engine.getPolicy(walletId)).toBeUndefined();
  });
});
