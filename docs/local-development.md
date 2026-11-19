# Local Development

This guide covers running the local Stellar network that the app talks to during development, and how to run the integration test suite against it.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with the Compose plugin (`docker compose`)
- [pnpm](https://pnpm.io/) (or `make`, if you prefer the Makefile targets)

The network is defined in [`docker/docker-compose.yml`](../docker/docker-compose.yml). It uses named volumes so your local ledger data persists across container restarts.

## Starting the network

The recommended way is via the pnpm scripts:

```bash
pnpm dev:stellar
```

This runs `docker compose -f docker/docker-compose.yml up -d` and starts the network in the background.

Equivalent commands:

```bash
# Makefile
make dev-stellar

# Raw docker compose
docker compose -f docker/docker-compose.yml up -d
```

## Stopping the network

```bash
pnpm dev:stellar:down
```

Equivalent commands:

```bash
make dev-stellar-down
docker compose -f docker/docker-compose.yml down
```

> **Note:** `down` removes the containers but keeps the named volumes, so your local ledger data survives. To wipe the data as well, run `docker compose -f docker/docker-compose.yml down -v`.

## Following logs

```bash
pnpm dev:stellar:logs
```

Equivalent commands:

```bash
make dev-stellar-logs
docker compose -f docker/docker-compose.yml logs -f
```

## Ports

The compose file publishes the following ports on `localhost`:

| Port | Service | Description |
| ---- | ------- | ----------- |
| `8000` | Horizon API & Stellar RPC | The HTTP API the app uses for submitting transactions and querying state. |
| `8080` | Stellar Core HTTP | Stellar Core's HTTP endpoint, useful for debugging core state. |
| `6000` | Stellar Core peer | The peer-to-peer port used by Stellar Core. |

## Apple Silicon (M1/M2/M3) notes

The Stellar Quickstart image is published for `linux/amd64` only. On Apple Silicon, Docker will fail to start the container unless the platform is set explicitly. The compose file already sets:

```yaml
platform: linux/amd64
```

If you run the container manually with `docker run`, you must pass `--platform linux/amd64` yourself:

```bash
docker run --rm -p 8000:8000 -p 8080:8080 -p 6000:6000 \
  --platform linux/amd64 \
  stellar/quickstart:testing --local --enable-stellar-rpc
```

## Running the integration suite

The integration tests use the compose file as a fixture. Start the network, then run the suite:

```bash
pnpm dev:stellar
pnpm integration
```

The `integration` script runs the test suite against the local network exposed on the ports above. When you're done:

```bash
pnpm dev:stellar:down
```

## Troubleshooting

- **Container exits immediately on Apple Silicon:** make sure you're using the compose file (or pass `--platform linux/amd64` to `docker run`).
- **Port already in use:** stop any other process bound to `8000`, `8080`, or `6000`, or stop a previously running network with `pnpm dev:stellar:down`.
- **Stale ledger state:** if you want a clean network, run `docker compose -f docker/docker-compose.yml down -v` to remove the named volumes, then start again.