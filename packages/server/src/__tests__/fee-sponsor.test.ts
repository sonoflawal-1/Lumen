import { describe, it, expect } from "vitest";
import { Keypair, TransactionBuilder, Operation, Asset, BASE_FEE } from "@stellar/stellar-sdk";
import { StellarClient } from "@lumen/core";
import { FeeSponsorService } from "../fee-sponsor/service.js";
import { EnvSigner } from "../signers/EnvSigner.js";

const HORIZON_URL = process.env.HORIZON_URL ?? "http://localhost:8000";
const RPC_URL = process.env.RPC_URL ?? "http://localhost:8000";

describe("FeeSponsorService Validation & Replay Protection", () => {
  const client = new StellarClient({
    network: "local",
    horizonUrl: HORIZON_URL,
    rpcUrl: RPC_URL,
  });

  const feePayerKeypair = Keypair.random();
  const feePayerSigner = new EnvSigner(feePayerKeypair.secret());

  function buildDummyTx(sourceKeypair: Keypair) {
    const destination = Keypair.random();
    const account = new (TransactionBuilder as any).Account(sourceKeypair.publicKey(), "100");
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: client.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: destination.publicKey(),
          asset: Asset.native(),
          amount: "10",
        })
      )
      .setTimeout(180)
      .build();

    tx.sign(sourceKeypair);
    return tx;
  }

  it("rejects resubmission of the same transaction (replay protection)", async () => {
    const service = new FeeSponsorService({
      client,
      signer: feePayerSigner,
    });

    const sourceKeypair = Keypair.random();
    const tx = buildDummyTx(sourceKeypair);
    const xdr = tx.toXDR();

    // First fee-bump wrap should succeed
    const feeBumpXdr1 = await service.wrapFeeBump(xdr, sourceKeypair.publicKey());
    expect(feeBumpXdr1).toBeDefined();

    // Second fee-bump wrap with identical XDR should fail
    await expect(service.wrapFeeBump(xdr, sourceKeypair.publicKey())).rejects.toThrow(
      "Replay attack detected"
    );
  });

  it("rejects fee-bump when walletAddress does not match inner tx source", async () => {
    const service = new FeeSponsorService({
      client,
      signer: feePayerSigner,
    });

    const sourceKeypair = Keypair.random();
    const otherWallet = Keypair.random();
    const tx = buildDummyTx(sourceKeypair);
    const xdr = tx.toXDR();

    await expect(service.wrapFeeBump(xdr, otherWallet.publicKey())).rejects.toThrow(
      "does not match walletAddress"
    );
  });

  it("rejects fee-bump when inner transaction is already a fee-bump", async () => {
    const service = new FeeSponsorService({
      client,
      signer: feePayerSigner,
    });

    const sourceKeypair = Keypair.random();
    const tx = buildDummyTx(sourceKeypair);

    // Build valid fee-bump first
    const feeBumpXdr = await service.wrapFeeBump(tx.toXDR());

    // Trying to wrap feeBumpXdr again as an inner tx must fail
    await expect(service.wrapFeeBump(feeBumpXdr)).rejects.toThrow(
      "Inner transaction cannot be a fee-bump transaction"
    );
  });
});
