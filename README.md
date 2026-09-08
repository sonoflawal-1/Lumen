# Lumen

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
4. [Why Lumen Is Different](#why-lumen-is-different)
5. [Quickstart](#quickstart)
6. [Packages](#packages)
7. [Environment](#environment)
8. [License](#license)

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
| API | Express | `/cosign`, `/fee-bump`, `/wallet/create`, `/policy` |

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
pnpm dev:stellar
```

> Or run using `docker compose`:
> ```bash
> docker compose -f docker/docker-compose.yml up -d
> ```

<details>
<summary>Raw docker run command (standalone container)</summary>

```bash
docker run --rm -p 8000:8000 -p 8080:8080 -p 6000:6000 --platform linux/amd64 stellar/quickstart:testing --local --enable-stellar-rpc
```

For full details on local environment ports (`8000`, `8080`, `6000`) and network configuration, see [docs/local-development.md](docs/local-development.md).

</details>

### 3. Docker Management Scripts

- `pnpm dev:stellar`: Starts local Stellar Docker network container using compose.
- `pnpm dev:stellar:down`: Brings down the local Stellar container.
- `pnpm dev:stellar:logs`: Streams logs from the local Stellar container.
- `pnpm test:integration`: Runs docker compose fixture and executes integration tests.

### 4. Configure your environment

```bash
cp .env.example .env
# Edit .env with your keys and network settings
```

### 5. Build and test

```bash
pnpm build
pnpm test
```

### 6. Start the server

```bash
pnpm --filter @lumen/server dev
```

---

## API Endpoints

| Endpoint | Method | Auth | Description |
| --- | --- | --- | --- |
| `/health` | GET | None | Server health and network status |
| `/cosign` | POST | None | Co-sign valid Stellar transactions after policy check |
| `/fee-bump` | POST | None | Wrap transaction in fee-bump transaction |
| `/fee-bump/submit` | POST | None | Wrap and submit fee-bumped transaction |
| `/policy/:walletId` | GET | None | Retrieve policy configuration for wallet |
| `/policy` | POST | None | Add policy configuration for wallet |
| `/wallet/create` | POST | Optional | Generate 2-of-2 multisig wallet, register record, return `{ id, address, userDevicePublicKey }` |
| `/wallet/:id` | GET | API Key | Retrieve wallet record by UUID `id` |
| `/wallet/by-address/:address` | GET | API Key | Retrieve wallet record by Stellar address |
| `/wallets` | GET | API Key | Paged listing of wallets (`?limit=50&cursor=...`) |
| `/wallets/:address` | GET | API Key | Retrieve single wallet by address for SDK recovery |
| `/wallet/:id` | DELETE | API Key | Remove server co-signer on-chain (`setOptions` weight 0) and delete wallet record |


---

## Packages

| Package | Description |
| --- | --- |
| **`@lumen/core`** | `StellarClient`, `createSponsoredAccount`, `setupMultisig`, `buildFeeBump`, `pathPayment`, `KeyManager`, `Wallet` |
| **`@lumen/server`** | `CosignerService`, `FeeSponsorService`, `PolicyEngine`, Express API |
| **`@lumen/web-sdk`** | `LumenClient`: `createWallet`, `getBalance`, `sendPayment` |
| **`@lumen/types`** | Shared TypeScript interfaces |

---

## License

MIT