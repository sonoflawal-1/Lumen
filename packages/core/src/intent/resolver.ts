import {
  Operation,
  Asset,
} from "@stellar/stellar-sdk";
import type { PaymentIntent, SwapIntent } from "@lumen/types";

export type IntentOp = ReturnType<typeof Operation.payment> | ReturnType<typeof Operation.pathPaymentStrictSend>;

export function resolvePaymentIntent(intent: PaymentIntent): IntentOp {
  const asset = intent.asset === "XLM"
    ? Asset.native()
    : parseAssetString(intent.asset);

  return Operation.payment({
    destination: intent.destination,
    asset,
    amount: intent.amount,
  });
}

export function resolveSwapIntent(intent: SwapIntent): IntentOp {
  const sendAsset = intent.send.asset === "XLM"
    ? Asset.native()
    : parseAssetString(intent.send.asset);

  const destAsset = intent.receive.asset === "XLM"
    ? Asset.native()
    : parseAssetString(intent.receive.asset);

  return Operation.pathPaymentStrictSend({
    sendAsset,
    sendAmount: intent.send.amount,
    destination: "", // caller must set
    destAsset,
    destMin: intent.receive.min ?? "0",
    path: [],
  });
}

function parseAssetString(assetStr: string): Asset {
  const [code, issuer] = assetStr.split(":");
  if (!issuer) throw new Error(`Asset must be CODE:ISSUER, got: ${assetStr}`);
  return new Asset(code, issuer);
}
