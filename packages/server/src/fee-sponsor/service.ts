import {
  TransactionBuilder,
  Transaction,
  Keypair,
} from "@stellar/stellar-sdk";
import type { Signer } from "@lumen/types";
import type { StellarClient } from "@lumen/core";

export interface FeeSponsorOpts {
  client: StellarClient;
  /** Production: use an AwsKmsSigner. Dev/testnet: use an EnvSigner. */
  signer: Signer;
  baseFee?: string;
}

export class FeeSponsorService {
  private client: StellarClient;
  private signer: Signer;
  private baseFee: string;

  constructor(opts: FeeSponsorOpts) {
    this.client = opts.client;
    this.signer = opts.signer;
    this.baseFee = opts.baseFee ?? "1000000";
  }

  get publicKey(): string {
    return this.signer.publicKey();
  }

  async wrapFeeBump(innerTxXdr: string): Promise<string> {
    const parsed = TransactionBuilder.fromXDR(
      innerTxXdr,
      this.client.networkPassphrase
    );
    const innerTx = parsed instanceof Transaction ? parsed : null;
    if (!innerTx) {
      throw new Error("Expected a regular transaction, not a fee-bump");
    }

    // Build the fee-bump envelope.  buildFeeBumpTransaction derives the
    // fee-source account from a Keypair; we create a public-key-only Keypair
    // so the private key is never needed here.  Signing uses our Signer
    // abstraction so the private key stays in KMS / never in memory.
    const feeSourceKeypair = Keypair.fromPublicKey(this.signer.publicKey());
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      feeSourceKeypair,
      this.baseFee,
      innerTx,
      this.client.networkPassphrase
    );

    // Sign via the abstracted Signer.
    const txHash = feeBump.hash();
    const signature = await this.signer.sign(txHash);
    const hint = feeSourceKeypair.rawPublicKey().slice(-4);

    feeBump.signatures.push({
      hint: () => hint,
      signature: () => signature,
    } as any);

    return feeBump.toXDR();
  }

  async submit(
    innerTxXdr: string
  ): Promise<{ hash: string; feeBumpHash: string }> {
    const feeBumpXdr = await this.wrapFeeBump(innerTxXdr);
    const parsed = TransactionBuilder.fromXDR(
      feeBumpXdr,
      this.client.networkPassphrase
    );

    const result = await this.client.horizon.submitTransaction(parsed);

    if (!result.successful) {
      throw new Error(`Fee-bump submission failed: ${result.hash}`);
    }

    return { hash: result.hash, feeBumpHash: result.hash };
  }
}
