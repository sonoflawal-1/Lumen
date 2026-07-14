import {
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import type { StellarClient } from "./client.js";

export interface CreateAccountOpts {
  client: StellarClient;
  sponsorKeypair: Keypair;
  newAccountKeypair: Keypair;
  startingBalance?: string;
}

export async function createSponsoredAccount(opts: CreateAccountOpts): Promise<{
  hash: string;
  address: string;
}> {
  const { client, sponsorKeypair, newAccountKeypair, startingBalance = "0" } = opts;

  const sponsorAccount = await client.horizon.loadAccount(sponsorKeypair.publicKey());

  const tx = new TransactionBuilder(sponsorAccount, {
    fee: BASE_FEE,
    networkPassphrase: client.networkPassphrase,
  })
    .addOperation(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: newAccountKeypair.publicKey(),
      })
    )
    .addOperation(
      Operation.createAccount({
        destination: newAccountKeypair.publicKey(),
        startingBalance,
      })
    )
    .addOperation(Operation.endSponsoringFutureReserves())
    .setTimeout(180)
    .build();

  tx.sign(sponsorKeypair, newAccountKeypair);

  const result = await client.horizon.submitTransaction(tx);

  if (result.successful) {
    return { hash: result.hash, address: newAccountKeypair.publicKey() };
  }

  throw new Error(`Account creation failed: ${result.hash}`);
}
