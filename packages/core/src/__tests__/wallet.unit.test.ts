import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { Wallet } from "../wallet/wallet.js";
import { StellarClient } from "../stellar/client.js";

describe("Wallet Secret Disposal (Issue 3)", () => {
  it("clears _keypair and _address on dispose()", () => {
    const client = new StellarClient({ network: "local" });
    const sponsorKeypair = Keypair.random();
    const serverKeypair = Keypair.random();

    const wallet = new Wallet({
      client,
      sponsorKeypair,
      serverPublicKey: serverKeypair.publicKey(),
    });

    // Simulate key initialization
    (wallet as any)._keypair = Keypair.random();
    (wallet as any)._address = (wallet as any)._keypair.publicKey();

    expect(wallet.isDisposed()).toBe(false);
    expect(typeof wallet.address).toBe("string");

    // Dispose
    wallet.dispose();

    expect(wallet.isDisposed()).toBe(true);
    expect((wallet as any)._keypair).toBeNull();
    expect((wallet as any)._address).toBeNull();
    expect(() => wallet.address).toThrow("Wallet not created or has been disposed");
  });

  it("prevents send() after wallet disposal and throws safe error without secret", async () => {
    const client = new StellarClient({ network: "local" });
    const sponsorKeypair = Keypair.random();
    const serverKeypair = Keypair.random();

    const wallet = new Wallet({
      client,
      sponsorKeypair,
      serverPublicKey: serverKeypair.publicKey(),
    });

    (wallet as any)._keypair = Keypair.random();
    (wallet as any)._address = (wallet as any)._keypair.publicKey();

    wallet.dispose();

    await expect(wallet.send("GDESTINATION...", {} as any, "100")).rejects.toThrow(
      "Wallet not initialized or has been disposed"
    );
  });

  it("asserts _keypair is null after dispose()", () => {
    const client = new StellarClient({ network: "local" });
    const sponsorKeypair = Keypair.random();
    const serverKeypair = Keypair.random();

    const wallet = new Wallet({
      client,
      sponsorKeypair,
      serverPublicKey: serverKeypair.publicKey(),
    });

    (wallet as any)._keypair = Keypair.random();
    (wallet as any)._address = (wallet as any)._keypair.publicKey();

    expect((wallet as any)._keypair).not.toBeNull();

    wallet.dispose();

    expect((wallet as any)._keypair).toBeNull();
  });

  it("send() after disposal rejects with a safe error that does not contain the secret seed", async () => {
    const client = new StellarClient({ network: "local" });
    const sponsorKeypair = Keypair.random();
    const serverKeypair = Keypair.random();

    const wallet = new Wallet({
      client,
      sponsorKeypair,
      serverPublicKey: serverKeypair.publicKey(),
    });

    const secretKeypair = Keypair.random();
    const secretSeed = secretKeypair.secret();
    (wallet as any)._keypair = secretKeypair;
    (wallet as any)._address = secretKeypair.publicKey();

    wallet.dispose();

    let caught: unknown;
    try {
      await wallet.send("GDESTINATION...", {} as any, "100");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toBe("Wallet not initialized or has been disposed");
    expect(message).not.toContain(secretSeed);
    expect(message).not.toContain(secretSeed.slice(0, 8));
  });
});
