# Lumen

[![CI](https://github.com/sonoflawal-1/Lumen/actions/workflows/ci.yml/badge.svg)](https://github.com/sonoflawal-1/Lumen/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Network](https://img.shields.io/badge/network-Stellar-orange.svg)](https://stellar.org)
[![Runtime](https://img.shields.io/badge/runtime-TypeScript%20%2B%20Node-blue.svg)](https://nodejs.org)

> **Seedless, gasless Stellar wallets — the user never holds a key or pays a fee.**

Lumen is a wallet SDK for building non-custodial Stellar wallets where the user never manages secret keys and never pays transaction fees. The server sponsors all accounts and fees, co-signs every transaction after a policy check, and enforces configurable rules (spend limits, velocity, allowlists) — all without holding user funds.

---

## Table of Contents

1. [Features](#features)
2. [How It Works](#how-it-works)
3. [Architecture](#architecture)
4. [API & Health Endpoints](#api--health-endpoints)
5. [Why Lumen Is Different](#why-lumen-is-different)
6. [Quickstart](#quickstart)
7. [Packages](#packages)
8. [Environment](#environment)
9. [License](#license)

---

## Features

| Feature | Description |
| --- | --- |
| **Seedless onboarding** | Users create a wallet in seconds — no seed phrase, no key management. |
| **Gasless UX** | The server fee-bumps every transaction so users never hold XLM for fees. |
| **2-of-2 multisig** | Every wallet is a 2-of-2 account: the user signs with their device key, the server co-signs after policy. |
| **Policy-controlled** | Spend limits, velocity rules, and destination allowlists enforced on-chain before co-signing. |
| **Sponsorship** | The server pays XLM reserves for account creation and transaction fees. |
| **Hardware-backed signing** | `Signer` abstraction supports AWS KMS, CloudHSM, and HashiCorp Vault for production. |
| **Structured Audit Trail** | 12-factor compatible JSON-lines audit logs correlation via `X-Request-Id`. |
| **CORS & Security** | Configurable origin allowlists, preflight options validation, and non-credentials health endpoints. |

---

## How It Works

```
User creates a wallet
  → Server sponsors the account (pays XLM reserve)
  → Server sets up 2-of-2 multisig
  → User signs with their device key
  → Server co-signs after a policy check
  → Transaction is fee-bumped so the user never holds XLM
```

| Layer | Backed by | What it is |
| --- | --- | --- |
| Identity | Stellar | 2-of-2 multisig account with co-signer |
| Fees | Stellar (fee-bumps) | Server wraps all txs; user pays zero gas |
| Policy | `@lumen/server` | Spend limits, velocity, allowlists enforced before co-signing |
| Key management | `@lumen/core` | Keypair generation, storage, derivation (OAuth, passphrase) |
| SDK | `@lumen/web-sdk` | Browser client: `createWallet`, `getBalance`, `sendPayment` |
| API | Express | `/cosign`, `/fee-bump`, `/wallet/create`, `/policy`, `/healthz/live`, `/healthz/ready` |

---

## API & Health Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/health` | GET | Basic network status |
| `/healthz/live` | GET | Liveness probe (Kubernetes / container orchestrator) |
| `/healthz/ready` | GET | Readiness probe checking Horizon, Soroban RPC, Fee-Payer balance, and Signers |
| `/wallet/create` | POST | Sponsor and set up a new 2-of-2 multisig wallet |
| `/cosign` | POST | Evaluate policy and co-sign user transaction |
| `/fee-bump` | POST | Wrap transaction in fee-bump envelope |
| `/fee-bump/submit` | POST | Wrap and submit fee-bumped transaction |
| `/policy` | POST | Create/update policy rules for a wallet |
| `/policy/:walletId` | GET | Fetch active policy for a wallet |

---

## Why Lumen Is Different

Most wallet SDKs require users to manage seed phrases and hold tokens for gas. Lumen makes both invisible.

| | Traditional Wallet | Lumen |
| --- | --- | --- |
| Onboarding | User must back up seed phrase | Seedless — server manages keys |
| Gas | User holds XLM for fees | Gasless — server fee-bumps all txs |
| Security | Single key controls funds | 2-of-2 multisig — server co-signs |
| Policy | None or off-chain | On-chain spend limits, velocity, allowlists |
| Control | Who holds the seed | Who holds the co-signer key |

---

## Quickstart

> **Prereqs:** Node.js 18+, pnpm, Docker (for the local Stellar network).

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start the local Stellar network

```bash
docker compose -f docker/docker-compose.yml up -d
```

### 3. Configure your environment

```bash
cp .env.example .env
# Edit .env with your keys and network settings
```

### 4. Build and test

```bash
pnpm build
pnpm test
```

### 5. Start the server

```bash
pnpm --filter @lumen/server dev
```

---

## Packages

| Package | Description |
| --- | --- |
| **`@lumen/core`** | `StellarClient`, `createSponsoredAccount`, `setupMultisig`, `buildFeeBump`, `pathPayment`, `KeyManager`, `Wallet` |
| **`@lumen/server`** | `CosignerService`, `FeeSponsorService`, `PolicyEngine`, `AuditLogger`, Express API |
| **`@lumen/web-sdk`** | `LumenClient`: `createWallet`, `getBalance`, `sendPayment` |
| **`@lumen/types`** | Shared TypeScript interfaces |

---

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `CORS_ORIGINS` | `http://localhost:3001,http://localhost:5173` | Allowed origins for browser fetch requests (or `*`) |
| `HEALTH_CHECK_TIMEOUT_MS` | `2000` | Timeout in ms for individual horizon/RPC readiness checks |
| `LOW_BALANCE_ALERT_THRESHOLD` | `5` | XLM balance threshold for fee-payer health checks |
| `SIGNER_PROVIDER` | `env` | Signer implementation (`env` or `awskms`) |

---

## License

MIT