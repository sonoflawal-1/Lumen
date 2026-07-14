import {
  Keypair,
  TransactionBuilder,
  Transaction,
  FeeBumpTransaction,
} from "@stellar/stellar-sdk";

export interface BuildFeeBumpOpts {
  feePayerKeypair: Keypair;
  innerTransaction: Transaction;
  baseFee?: string;
  networkPassphrase: string;
}

export function buildFeeBump(opts: BuildFeeBumpOpts): FeeBumpTransaction {
  const { feePayerKeypair, innerTransaction, baseFee = "1000000", networkPassphrase } = opts;

  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    feePayerKeypair,
    baseFee,
    innerTransaction,
    networkPassphrase
  );

  feeBump.sign(feePayerKeypair);

  return feeBump;
}
