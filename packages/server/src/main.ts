import { createServer } from "./server.js";

const cosignerSecret = process.env.COSIGNER_SECRET;
const feePayerSecret = process.env.FEE_PAYER_SECRET;

if (!cosignerSecret || !feePayerSecret) {
  console.error("Missing COSIGNER_SECRET or FEE_PAYER_SECRET env vars");
  process.exit(1);
}

createServer({
  port: parseInt(process.env.PORT ?? "3000"),
  network: (process.env.STELLAR_NETWORK as any) ?? "testnet",
  horizonUrl: process.env.HORIZON_URL,
  rpcUrl: process.env.SOROBAN_RPC_URL,
  cosignerSecret,
  feePayerSecret,
});
