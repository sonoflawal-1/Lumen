import {
  Keypair,
  TransactionBuilder,
  Operation,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import type { StellarClient } from "./client.js";

export interface SetupMultisigOpts {
  client: StellarClient;
  accountKeypair: Keypair;
  coSignerPublicKey: string;
  threshold?: number;
}

export async function setupMultisig(opts: SetupMultisigOpts): Promise<{ hash: string }> {
  const { client, accountKeypair, coSignerPublicKey, threshold = 2 } = opts;

  const account = await client.horizon.loadAccount(accountKeypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: client.networkPassphrase,
  })
    .addOperation(
      Operation.setOptions({
        signer: { ed25519PublicKey: coSignerPublicKey, weight: 1 },
      })
    )
    .addOperation(
      Operation.setOptions({
        lowThreshold: threshold,
        medThreshold: threshold,
        highThreshold: threshold,
      })
    )
    .setTimeout(180)
    .build();

  tx.sign(accountKeypair);

  const result = await client.horizon.submitTransaction(tx);

  if (result.successful) {
    return { hash: result.hash };
  }

  throw new Error(`Multisig setup failed: ${result.hash}`);
}
