import type { WalletRecord } from "@lumen/types";

/**
 * Persistence backend interface for the wallet registry.
 *
 * The default in-memory implementation is used when no backend is supplied.
 * A `PolicyStore`-backed implementation (see #27) can be provided later to
 * persist wallet records across server restarts, without changing the
 * `WalletStore` API surface used by the HTTP handlers.
 */
export interface WalletStoreBackend {
  load(): WalletRecord[] | Promise<WalletRecord[]>;
  save(record: WalletRecord): void | Promise<void>;
  remove(id: string): void | Promise<void>;
}

export interface ListWalletsResult {
  items: WalletRecord[];
  nextCursor?: string;
}

export class WalletStore {
  private wallets: Map<string, WalletRecord> = new Map();
  private addressIndex: Map<string, string> = new Map();
  private backend?: WalletStoreBackend;
  private loaded = false;

  constructor(backend?: WalletStoreBackend) {
    this.backend = backend;
  }

  /**
   * Hydrate the in-memory registry from the configured backend.
   * Safe to call multiple times; only loads once.
   */
  async init(): Promise<void> {
    if (this.loaded || !this.backend) {
      this.loaded = true;
      return;
    }
    const records = await this.backend.load();
    for (const record of records) {
      this.indexRecord(record);
    }
    this.loaded = true;
  }

  private indexRecord(record: WalletRecord): void {
    this.wallets.set(record.id, record);
    this.addressIndex.set(record.address, record.id);
  }

  addWallet(record: WalletRecord): WalletRecord {
    this.indexRecord(record);
    if (this.backend) {
      void this.backend.save(record);
    }
    return record;
  }

  getWallet(id: string): WalletRecord | undefined {
    return this.wallets.get(id);
  }

  getWalletByAddress(address: string): WalletRecord | undefined {
    const id = this.addressIndex.get(address);
    if (!id) return undefined;
    return this.wallets.get(id);
  }

  listWallets(limit = 50, cursor?: string): ListWalletsResult {
    const all = Array.from(this.wallets.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    let startIndex = 0;
    if (cursor) {
      const idx = all.findIndex((w) => w.id === cursor);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const items = all.slice(startIndex, startIndex + limit);
    const nextCursor =
      items.length === limit && startIndex + limit < all.length
        ? items[items.length - 1].id
        : undefined;

    return { items, nextCursor };
  }

  deleteWallet(id: string): boolean {
    const wallet = this.wallets.get(id);
    if (!wallet) return false;
    this.addressIndex.delete(wallet.address);
    const deleted = this.wallets.delete(id);
    if (deleted && this.backend) {
      void this.backend.remove(id);
    }
    return deleted;
  }
}