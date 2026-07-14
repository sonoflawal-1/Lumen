export interface Intent {
  type: "payment" | "swap" | "contract_call";
  params: Record<string, unknown>;
}

export interface PaymentIntent {
  type: "payment";
  asset: string;
  amount: string;
  destination: string;
  memo?: string;
}

export interface SwapIntent {
  type: "swap";
  send: { asset: string; amount: string };
  receive: { asset: string; min?: string };
}
