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
  private usedNonces: Set<string> = new Set();
  private maxCacheSize = 10000;

  constructor(opts: FeeSponsorOpts) {
    this.client = opts.client;
    this.signer = opts.signer;
    this.baseFee = opts.baseFee ?? "1000000";
  }

  get publicKey(): string {
    return this.signer.publicKey();
  }

  /** Clear tracked nonces/hashes (useful for testing or cache resets) */
  clearUsedNonces(): void {
    this.usedNonces.clear();
  }

  async wrapFeeBump(
    innerTxXdr: string,
    walletAddress?: string
  ): Promise<string> {
    let parsed;
    try {
      parsed = TransactionBuilder.fromXDR(
        innerTxXdr,
        this.client.networkPassphrase
      );
    } catch (e: any) {
      throw new Error(`Invalid transaction XDR: ${e.message}`);
    }

    if (!(parsed instanceof Transaction)) {
      throw new Error("Inner transaction cannot be a fee-bump transaction");
    }

    const innerTx = parsed;

    // 1. Verify walletAddress matches inner transaction source account if provided
    if (walletAddress && innerTx.source !== walletAddress) {
      throw new Error(
        `Inner transaction source account (${innerTx.source}) does not match walletAddress (${walletAddress})`
      );
    }

    // 2. Replay check: ensure this inner transaction hash hasn't already been fee-bumped
    const txHash = innerTx.hash().toString("hex");
    if (this.usedNonces.has(txHash)) {
      throw new Error(
        `Replay attack detected: Transaction ${txHash} has already been sponsored/submitted`
      );
    }

    // Mark nonce/hash as used
    if (this.usedNonces.size >= this.maxCacheSize) {
      // Remove oldest item from set
      const first = this.usedNonces.values().next().value;
      if (first) this.usedNonces.delete(first);
    }
    this.usedNonces.add(txHash);

    // Build the fee-bump envelope
    const feeSourceKeypair = Keypair.fromPublicKey(this.signer.publicKey());
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      feeSourceKeypair,
      this.baseFee,
      innerTx,
      this.client.networkPassphrase
    );

    // Sign via the abstracted Signer
    const feeBumpHash = feeBump.hash();
    const signature = await this.signer.sign(feeBumpHash);
    const hint = feeSourceKeypair.rawPublicKey().slice(-4);

    feeBump.signatures.push({
      hint: () => hint,
      signature: () => signature,
    } as any);

    return feeBump.toXDR();
  }

  async submit(
    innerTxXdr: string,
    walletAddress?: string
  ): Promise<{ hash: string; feeBumpHash: string }> {
    const feeBumpXdr = await this.wrapFeeBump(innerTxXdr, walletAddress);
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
