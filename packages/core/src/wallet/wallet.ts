import {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  BASE_FEE,
  Memo,
  Account,
  Transaction,
} from "@stellar/stellar-sdk";
import type { StellarClient } from "../stellar/client.js";
import { createSponsoredAccount } from "../stellar/account.js";
import { setupMultisig } from "../stellar/multisig.js";
import { KeyManager } from "../keys/manager.js";

export interface WalletOpts {
  client: StellarClient;
  sponsorKeypair: Keypair;
  serverPublicKey: string;
}

export interface SendOpts {
  destination?: string;
  asset?: Asset;
  amount?: string;
  memo?: Memo | string | number | Buffer;
  timebounds?: { minTime?: number | string; maxTime?: number | string } | number;
  baseFee?: number | string;
  extraOperations?: Operation[];
  sequenceNumber?: string;
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

  async buildTransaction(opts: SendOpts): Promise<Transaction> {
    if (!this.address) throw new Error("Wallet not initialized");

    let accountObj: Account;

    if (opts.sequenceNumber) {
      accountObj = new Account(this.address, opts.sequenceNumber);
    } else {
      const horizonAccount = await this.client.horizon.loadAccount(this.address);
      accountObj = new Account(this.address, horizonAccount.sequence);
    }

    const builder = new TransactionBuilder(accountObj, {
      fee: String(opts.baseFee ?? BASE_FEE),
      networkPassphrase: this.client.networkPassphrase,
    });

    if (opts.destination && opts.asset && opts.amount) {
      builder.addOperation(
        Operation.payment({
          destination: opts.destination,
          asset: opts.asset,
          amount: opts.amount,
        })
      );
    }

    if (opts.extraOperations && opts.extraOperations.length > 0) {
      for (const op of opts.extraOperations) {
        builder.addOperation(op);
      }
    }

    if (opts.memo) {
      if (opts.memo instanceof Memo) {
        builder.addMemo(opts.memo);
      } else if (typeof opts.memo === "string") {
        builder.addMemo(Memo.text(opts.memo));
      } else if (typeof opts.memo === "number") {
        builder.addMemo(Memo.id(String(opts.memo)));
      } else if (Buffer.isBuffer(opts.memo)) {
        builder.addMemo(Memo.hash(opts.memo.toString("hex")));
      }
    }

    if (opts.timebounds !== undefined) {
      if (typeof opts.timebounds === "number") {
        builder.setTimeout(opts.timebounds);
      } else {
        builder.setTimebounds({
          minTime: String(opts.timebounds.minTime ?? 0),
          maxTime: String(opts.timebounds.maxTime ?? 0),
        });
      }
    } else {
      builder.setTimeout(180);
    }

    return builder.build();
  }

  async send(
    destinationOrOpts: string | SendOpts,
    asset?: Asset,
    amount?: string,
    opts?: Partial<SendOpts>
  ): Promise<{ hash: string }> {
    if (!this._keypair) throw new Error("Wallet not initialized");

    let sendOpts: SendOpts;
    if (typeof destinationOrOpts === "object") {
      sendOpts = destinationOrOpts;
    } else {
      if (!asset || !amount) {
        throw new Error("Asset and amount are required when destination is passed as first argument");
      }
      sendOpts = {
        destination: destinationOrOpts,
        asset,
        amount,
        ...opts,
      };
    }

    const tx = await this.buildTransaction(sendOpts);
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
