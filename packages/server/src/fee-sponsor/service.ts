import {
  Keypair,
  TransactionBuilder,
  Transaction,
} from "@stellar/stellar-sdk";
import type { StellarClient } from "@lumen/core";

export interface FeeSponsorOpts {
  client: StellarClient;
  feePayerKeypair: Keypair;
  baseFee?: string;
}

export class FeeSponsorService {
  private client: StellarClient;
  private feePayerKeypair: Keypair;
  private baseFee: string;

  constructor(opts: FeeSponsorOpts) {
    this.client = opts.client;
    this.feePayerKeypair = opts.feePayerKeypair;
    this.baseFee = opts.baseFee ?? "1000000";
  }

  async wrapFeeBump(innerTxXdr: string): Promise<string> {
    const parsed = TransactionBuilder.fromXDR(innerTxXdr, this.client.networkPassphrase);
    const innerTx = parsed instanceof Transaction ? parsed : null;
    if (!innerTx) throw new Error("Expected a regular transaction, not a fee-bump");

    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      this.feePayerKeypair,
      this.baseFee,
      innerTx,
      this.client.networkPassphrase
    );

    feeBump.sign(this.feePayerKeypair);

    return feeBump.toXDR();
  }

  async submit(innerTxXdr: string): Promise<{ hash: string; feeBumpHash: string }> {
    const feeBumpXdr = await this.wrapFeeBump(innerTxXdr);
    const parsed = TransactionBuilder.fromXDR(feeBumpXdr, this.client.networkPassphrase);

    const result = await this.client.horizon.submitTransaction(parsed);

    if (!result.successful) {
      throw new Error(`Fee-bump submission failed: ${result.hash}`);
    }

    return { hash: result.hash, feeBumpHash: result.hash };
  }
}
