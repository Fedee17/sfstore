import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getWebTransferPrice, hasValidWebPrice } from "@/lib/web-transfer-pricing";
import type { Product } from "@/types/product";
import { commercialLineKey, componentPublicationSlug, fitsComponentInventory, type CableConnector } from "@/lib/products/component-combos";

export type CartItem = {
  displayName?: string;
  primaryImageUrl?: string | null;
  primaryImageAlt?: string | null;
  comboConnector?: CableConnector;
  comboPriceVersion?: string;
  components?: { productId: string; stock: number }[];
  familyId?: string;
  variantLabel?: string;
  sku?: string | null;
  productId: string;
  name: string;
  slug: string;
  category: Product["category"];
  price: number;
  transferPrice?: number | null;
  quantity: number;
  stock: number;
};

type CartState = {
  invalidPriceNotice: boolean;
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  addItem: (product: Product) => void;
  addComponents: (head: Product, cable: Product) => boolean;
  addCombo: (presentationId: string, name: string, connector: CableConnector, listPrice: number, version: string, head: Product, cable: Product, presentation?: Product) => boolean;
  removeItem: (productId: string) => void;
  increaseQuantity: (productId: string) => void;
  decreaseQuantity: (productId: string) => void;
  clearCart: () => void;
  restoreItems: (items: CartItem[]) => void;
  syncCatalog: (catalog: Record<string, { price: number; cashPrice?: number | null; stock: number }>) => void;
  /** Buyer-facing notices of the last catalog sync; shared by the cart page and drawer, never persisted. */
  syncNotices: string[];
  clearSyncNotices: () => void;
};

/** Fired after a product is added, so the cart drawer can open (owner request 20/11). */
export const cartAddedEvent = "sfstore:cart-added";

/** Display-only snapshot of this SKU; never use a family or component photo. */
function getCartPresentation(product?: Product) {
  if (!product || product.kind === "family") return {};
  const image = [...(product.images ?? [])].filter(image => image.url).sort((a, b) =>
    Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
  )[0];
  return {
    displayName: product.familyName ?? product.name,
    primaryImageUrl: image?.url ?? product.primaryImageUrl ?? null,
    primaryImageAlt: image?.alt ?? product.primaryImageAlt ?? product.name,
  };
}

function calculateTotals(items: CartItem[]) {
  return {
    totalItems: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: items.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    ),
  };
}

// Carts saved before 26/11/2026 may lack the line cash price; until then every product (and every combo) was 75% of list.
function withCashPrice(item: CartItem): CartItem {
  return hasValidWebPrice(item.transferPrice) || !hasValidWebPrice(item.price) ? item : { ...item, transferPrice: getWebTransferPrice(item.price) };
}

function withTotals(items: CartItem[]) {
  items = items.filter(item => hasValidWebPrice(item.price));
  return {
    items,
    ...calculateTotals(items),
  };
}
export const cartItemKey = (item: Pick<CartItem, "productId" | "comboConnector">) => commercialLineKey(item.productId, item.comboConnector);
function stockChecked(current: CartItem[], next: CartItem[]) { return withTotals(fitsComponentInventory(next) ? next : current); }

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      invalidPriceNotice: false,
      syncNotices: [],
      items: [],
      totalItems: 0,
      subtotal: 0,
      addCombo: (id, name, connector, price, version, head, cable, presentation) => {
        let added = false;
        set(state => {
          if (!version || !hasValidWebPrice(price) || !hasValidWebPrice(head.price) || !hasValidWebPrice(cable.price) || head.id === cable.id) return state;
          const key = commercialLineKey(id, connector), index = state.items.findIndex(i => cartItemKey(i) === key);
          const item: CartItem = { productId: id, name: `${name} · ${connector === "cc" ? "USB-C a USB-C" : "USB-C a Lightning"}`, slug: componentPublicationSlug(id, connector), category: head.category, price, transferPrice: getWebTransferPrice(price), quantity: (index < 0 ? 0 : state.items[index].quantity) + 1, stock: Math.min(head.stock, cable.stock), comboConnector: connector, comboPriceVersion: version, components: [head, cable].map(p => ({ productId: p.id, stock: p.stock })) };
          const items = state.items.map(i => ({ ...i }));
          if (presentation?.combo?.presentationId === id && presentation.combo.connector === connector) Object.assign(item, getCartPresentation(presentation));
          if (index < 0) items.push(item); else items[index] = item;
          if (!fitsComponentInventory(items)) return state;
          added = true; return withTotals(items);
        });
        return added;
      },
      addComponents: (head, cable) => {
        let added = false;
        set(state => {
          const products = [head, cable];
          if (head.id === cable.id || products.some(p => (p.kind === "family" || p.kind === "combo") || !hasValidWebPrice(p.price) || !hasValidWebPrice(p.transferPrice) || !Number.isSafeInteger(p.stock) || p.stock < (state.items.find(i => i.productId === p.id)?.quantity ?? 0) + 1)) return state;
          const items = state.items.map(i => ({ ...i }));
          for (const p of products) {
            const index = items.findIndex(i => i.productId === p.id);
            const line: CartItem = { productId: p.id, name: p.name, slug: p.slug, category: p.category, price: p.price, transferPrice: p.transferPrice, stock: p.stock, familyId: p.familyId, variantLabel: p.variantLabel, sku: p.sku, quantity: (index >= 0 ? items[index].quantity : 0) + 1 };
            Object.assign(line, getCartPresentation(p));
            if (index >= 0) items[index] = line; else items.push(line);
          }
          added = true;
          if (!fitsComponentInventory(items)) { added = false; return state; }
          return withTotals(items);
        });
        return added;
      },
      addItem: (product) => {
        if (!hasValidWebPrice(product.price)) return;
        if (product.kind !== "combo" && !hasValidWebPrice(product.transferPrice)) return;
        if (product.kind === "combo") {
          const c = product.combo;
          if (c) get().addCombo(c.presentationId, "Cargador completo", c.connector, product.price, c.priceVersion, c.head, c.cable, product);
          return;
        }
        set((state) => {
          if (product.kind === "family" || product.stock <= 0) {
            return state;
          }

          const existingItem = state.items.find(
            (item) => !item.comboConnector && item.productId === product.id,
          );

          if (existingItem) {
            const items = state.items.map((item) =>
              !item.comboConnector && item.productId === product.id
                ? {
                    ...item,
                    ...getCartPresentation(product),
                    name: product.name, slug: product.slug, price: product.price, transferPrice: product.transferPrice,
                    familyId: product.familyId, variantLabel: product.variantLabel, sku: product.sku,
                    stock: product.stock, quantity: Math.min(item.quantity + 1, product.stock),
                  }
                : item,
            );

            return stockChecked(state.items, items);
          }

          return stockChecked(state.items, [
            ...state.items,
            {
              ...getCartPresentation(product),
              familyId: product.familyId, variantLabel: product.variantLabel, sku: product.sku,
              productId: product.id,
              name: product.name,
              slug: product.slug,
              category: product.category,
              price: product.price,
              transferPrice: product.transferPrice ?? null,
              quantity: 1,
              stock: product.stock,
            },
          ]);
        });
      },
      removeItem: (productId) =>
        set((state) =>
          withTotals(
            state.items.filter((item) => cartItemKey(item) !== productId),
          ),
        ),
      increaseQuantity: (productId) =>
        set((state) =>
          stockChecked(state.items,
            state.items.map((item) =>
              cartItemKey(item) === productId
                ? {
                    ...item,
                    quantity: Math.min(item.quantity + 1, item.stock),
                  }
                : item,
            ),
          ),
        ),
      decreaseQuantity: (productId) =>
        set((state) =>
          withTotals(
            state.items
              .map((item) =>
              cartItemKey(item) === productId
                  ? { ...item, quantity: item.quantity - 1 }
                  : item,
              )
              .filter((item) => item.quantity > 0),
          ),
        ),
      clearCart: () => set({ items: [], totalItems: 0, subtotal: 0, invalidPriceNotice: false }),
      // Undo of a removal: puts back the exact lines the buyer had a moment ago.
      restoreItems: (items) => set(withTotals(items)),
      // Brings simple SKUs up to the current public price and stock. Combos and SKUs missing from the answer stay
      // as they are: checkout validates them server-side. Leaves one buyer-facing notice per change.
      syncCatalog: (catalog) => {
        const notices: string[] = [];
        set(state => {
          const items = state.items.flatMap(item => {
            const current = item.comboConnector ? undefined : catalog[item.productId];
            if (!current || typeof current.price !== "number" || !Number.isSafeInteger(current.stock)) return [item];
            const name = item.displayName ?? item.name;
            if (current.stock <= 0) { notices.push(`${name} se agotó y lo quitamos del carrito.`); return []; }
            const next = { ...item, stock: current.stock };
            const cash = hasValidWebPrice(current.cashPrice) ? current.cashPrice : null;
            if (hasValidWebPrice(current.price) && (current.price !== item.price || cash !== item.transferPrice)) { next.price = current.price; next.transferPrice = cash; notices.push(`Cambió el precio de ${name}.`); }
            if (item.quantity > current.stock) { next.quantity = current.stock; notices.push(current.stock === 1 ? `Queda 1 unidad de ${name}: ajustamos la cantidad.` : `Quedan ${current.stock} unidades de ${name}: ajustamos la cantidad.`); }
            return [next];
          });
          return { ...withTotals(items), syncNotices: notices };
        });
      },
      clearSyncNotices: () => set({ syncNotices: [] }),
    }),
    {
      name: "sfstore-cart",
      version: 2,
      migrate: (persisted) => {
        const previous=persisted as {items?:CartItem[]};
        const items=Array.isArray(previous?.items)?previous.items.filter(p=>p && typeof p.productId==="string"&&Number.isSafeInteger(p.quantity)&&p.quantity>0).map(withCashPrice):[];
        return { ...withTotals(items), invalidPriceNotice: items.some(item => !hasValidWebPrice(item.price)) };
      },
      // Runs for the CURRENT storage version too: migrate alone skips those carts.
      merge: (persisted, current) => {
        const previous = persisted as { items?: CartItem[]; invalidPriceNotice?: boolean } | undefined;
        const rows = Array.isArray(previous?.items) ? previous.items.filter(item => item && typeof item.productId === "string" && Number.isSafeInteger(item.quantity) && item.quantity > 0).map(withCashPrice) : [];
        return { ...current, ...withTotals(rows), invalidPriceNotice: previous?.invalidPriceNotice === true || rows.some(item => !hasValidWebPrice(item.price)) };
      },
      partialize: ({ items, totalItems, subtotal, invalidPriceNotice }) => ({ items, totalItems, subtotal, invalidPriceNotice }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

const subscribeToCartHydration = (update: () => void) => useCartStore.persist.onFinishHydration(update);

/** Review 21/11: false on the server and until the saved cart is read, so pages do not flash an empty-cart message. */
export function useCartHydrated() {
  return useSyncExternalStore(subscribeToCartHydration, () => useCartStore.persist.hasHydrated(), () => false);
}
