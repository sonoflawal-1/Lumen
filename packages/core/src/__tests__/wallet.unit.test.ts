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

  it("does not leak secret material in errors thrown after dispose()", async () => {
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

    // address getter must throw a safe message
    let addressError: unknown;
    try {
      void wallet.address;
    } catch (err) {
      addressError = err;
    }
    expect(addressError).toBeInstanceOf(Error);
    expect((addressError as Error).message).toBe(
      "Wallet not created or has been disposed"
    );
    expect((addressError as Error).message).not.toContain(secretSeed);

    // send() must reject with a safe message
    let sendError: unknown;
    try {
      await wallet.send("GDESTINATION...", {} as any, "100");
    } catch (err) {
      sendError = err;
    }
    expect(sendError).toBeInstanceOf(Error);
    expect((sendError as Error).message).toBe(
      "Wallet not initialized or has been disposed"
    );
    expect((sendError as Error).message).not.toContain(secretSeed);
  });

  it("dispose() is idempotent and leaves _keypair null", () => {
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
    expect((wallet as any)._keypair).toBeNull();

    // Second dispose must not throw and must keep _keypair null
    expect(() => wallet.dispose()).not.toThrow();
    expect((wallet as any)._keypair).toBeNull();
    expect(wallet.isDisposed()).toBe(true);
  });
});
