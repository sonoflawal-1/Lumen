import type { WalletRecord } from "@lumen/types";

export class WalletStore {
  private wallets: Map<string, WalletRecord> = new Map();
  private addressIndex: Map<string, string> = new Map();

  addWallet(record: WalletRecord): WalletRecord {
    this.wallets.set(record.id, record);
    this.addressIndex.set(record.address, record.id);
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

  listWallets(limit = 50, cursor?: string): { items: WalletRecord[]; nextCursor?: string } {
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
    return this.wallets.delete(id);
  }
}
