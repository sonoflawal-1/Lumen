import { describe, it, expect } from "vitest";
import { Keypair, Asset, Operation, Memo, Networks } from "@stellar/stellar-sdk";
import { StellarClient } from "../stellar/client.js";
import { Wallet, type SendOpts } from "../wallet/wallet.js";

function getClient() {
  return new StellarClient({
    network: "local",
    horizonUrl: "http://localhost:8000",
    rpcUrl: "http://localhost:8000",
  });
}

describe("Wallet builder & transaction options (#36)", () => {
  const client = getClient();
  const sponsor = Keypair.random();
  const serverKp = Keypair.random();

  it("builds transaction with custom memo, baseFee, timebounds, and extraOperations", async () => {
    const wallet = new Wallet({
      client,
      sponsorKeypair: sponsor,
      serverPublicKey: serverKp.publicKey(),
    });

    const destination = Keypair.random().publicKey();
    const asset = Asset.native();
    const amount = "10";
    const extraOp = Operation.payment({
      destination: Keypair.random().publicKey(),
      asset: Asset.native(),
      amount: "5",
    });

    const sequenceNumber = "100";
    const dummyKey = Keypair.random();
    (wallet as any)._address = dummyKey.publicKey();

    const opts: SendOpts = {
      destination,
      asset,
      amount,
      memo: "test-memo-reconciliation",
      baseFee: "200",
      timebounds: { minTime: 1000, maxTime: 2000 },
      extraOperations: [extraOp],
      sequenceNumber,
    };

    const tx = await wallet.buildTransaction(opts);

    expect(tx).toBeDefined();
    expect(tx.fee).toBe("400"); // 2 operations * 200 baseFee
    expect(tx.operations).toHaveLength(2);
    expect(tx.memo.value?.toString()).toBe("test-memo-reconciliation");
    expect(tx.timeBounds?.minTime).toBe("1000");
    expect(tx.timeBounds?.maxTime).toBe("2000");
  });
});
