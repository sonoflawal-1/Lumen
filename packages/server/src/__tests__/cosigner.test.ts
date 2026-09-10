import { describe, it, expect } from "vitest";
import {
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  Account,
  BASE_FEE,
  Networks,
} from "@stellar/stellar-sdk";
import { StellarClient } from "@lumen/core";
import { CosignerService } from "../cosigner/service.js";
import { EnvSigner } from "../signers/EnvSigner.js";
import { PolicyEngine } from "../policy/engine.js";

function getClient() {
  return new StellarClient({
    network: "local",
    horizonUrl: "http://localhost:8000",
    rpcUrl: "http://localhost:8000",
  });
}

describe("CosignerService device signature verification", () => {
  const client = getClient();
  const serverKp = Keypair.random();
  const signer = new EnvSigner(serverKp.secret());
  const policyEngine = new PolicyEngine();
  const cosignerService = new CosignerService({
    client,
    signer,
    policyEngine,
  });

  it("rejects unsigned XDR with UserSignatureMissingError reason", async () => {
    const userDeviceKp = Keypair.random();
    const destinationKp = Keypair.random();
    const account = new Account(userDeviceKp.publicKey(), "100");

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: client.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: destinationKp.publicKey(),
          asset: Asset.native(),
          amount: "10",
        })
      )
      .setTimeout(180)
      .build();

    const unsignedXdr = tx.toXDR();

    const result = await cosignerService.cosign({
      xdr: unsignedXdr,
      walletAddress: userDeviceKp.publicKey(),
      userPublicKey: userDeviceKp.publicKey(),
    });

    expect(result.approved).toBe(false);
    expect(result.reason).toContain("UserSignatureMissingError");
  });

  it("rejects transaction if transaction source does not match walletAddress", async () => {
    const userDeviceKp = Keypair.random();
    const otherAccountKp = Keypair.random();
    const account = new Account(otherAccountKp.publicKey(), "100");

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: client.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: Keypair.random().publicKey(),
          asset: Asset.native(),
          amount: "10",
        })
      )
      .setTimeout(180)
      .build();

    tx.sign(userDeviceKp);

    const result = await cosignerService.cosign({
      xdr: tx.toXDR(),
      walletAddress: userDeviceKp.publicKey(),
    });

    expect(result.approved).toBe(false);
    expect(result.reason).toContain("Source account mismatch");
  });

  it("approves and co-signs transaction when user device key has signed", async () => {
    const userDeviceKp = Keypair.random();
    const destinationKp = Keypair.random();
    const account = new Account(userDeviceKp.publicKey(), "100");

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: client.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: destinationKp.publicKey(),
          asset: Asset.native(),
          amount: "10",
        })
      )
      .setTimeout(180)
      .build();

    // User device key signs first
    tx.sign(userDeviceKp);

    const result = await cosignerService.cosign({
      xdr: tx.toXDR(),
      walletAddress: userDeviceKp.publicKey(),
      userPublicKey: userDeviceKp.publicKey(),
    });

    expect(result.approved).toBe(true);
    expect(result.signedXdr).toBeDefined();
    expect(result.signedXdr).not.toBe("");
  });
});
