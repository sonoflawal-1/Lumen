import { Keypair, Asset, Operation, TransactionBuilder, BASE_FEE } from "@stellar/stellar-sdk";
import type { StellarClient } from "../stellar/client.js";
import { createSponsoredAccount } from "../stellar/account.js";
import { setupMultisig } from "../stellar/multisig.js";
import { KeyManager } from "../keys/manager.js";

export interface WalletOpts {
  client: StellarClient;
  sponsorKeypair: Keypair;
  serverPublicKey: string;
}

export class Wallet {
  private client: StellarClient;
  private sponsorKeypair: Keypair;
  private serverPublicKey: string;
  private keyManager: KeyManager;
  private _address: string | null = null;
  private _keypair: Keypair | null = null;

  constructor(opts: WalletOpts) {
    this.client = opts.client;
    this.sponsorKeypair = opts.sponsorKeypair;
    this.serverPublicKey = opts.serverPublicKey;
    this.keyManager = new KeyManager();
  }

  get address(): string {
    if (!this._address) throw new Error("Wallet not created yet");
    return this._address;
  }

  async create(): Promise<{ address: string; publicKey: string }> {
    this._keypair = this.keyManager.generateKeypair();

    await createSponsoredAccount({
      client: this.client,
      sponsorKeypair: this.sponsorKeypair,
      newAccountKeypair: this._keypair,
    });

    await setupMultisig({
      client: this.client,
      accountKeypair: this._keypair,
      coSignerPublicKey: this.serverPublicKey,
    });

    this._address = this._keypair.publicKey();
    this.keyManager.store(this._keypair, "default");

    return { address: this._address, publicKey: this._address };
  }

  async getBalance(asset?: Asset): Promise<string> {
    const account = await this.client.horizon.loadAccount(this.address);

    if (!asset || asset.isNative()) {
      const balance = account.balances.find((b: any) => b.asset_type === "native");
      return balance?.balance ?? "0";
    }

    const balance = account.balances.find(
      (b: any) => b.asset_code === asset.getCode() && b.asset_issuer === asset.getIssuer()
    );
    return (balance as any)?.balance ?? "0";
  }

  async send(destination: string, asset: Asset, amount: string): Promise<{ hash: string }> {
    if (!this._keypair) throw new Error("Wallet not initialized");

    const account = await this.client.horizon.loadAccount(this.address);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.client.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination,
          asset,
          amount,
        })
      )
      .setTimeout(180)
      .build();

    tx.sign(this._keypair);

    const result = await this.client.horizon.submitTransaction(tx);

    if (result.successful) {
      return { hash: result.hash };
    }

    throw new Error(`Payment failed: ${result.hash}`);
  }

  getAddress(): string {
    return this.address;
  }
}
