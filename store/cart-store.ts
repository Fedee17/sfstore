import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Product } from "@/types/product";

export type CartItem = {
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
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  increaseQuantity: (productId: string) => void;
  decreaseQuantity: (productId: string) => void;
  clearCart: () => void;
};

function calculateTotals(items: CartItem[]) {
  return {
    totalItems: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: items.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    ),
  };
}

function withTotals(items: CartItem[]) {
  return {
    items,
    ...calculateTotals(items),
  };
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      totalItems: 0,
      subtotal: 0,
      addItem: (product) =>
        set((state) => {
          if (product.stock <= 0) {
            return state;
          }

          const existingItem = state.items.find(
            (item) => item.productId === product.id,
          );

          if (existingItem) {
            const items = state.items.map((item) =>
              item.productId === product.id
                ? {
                    ...item,
                    quantity: Math.min(item.quantity + 1, item.stock),
                  }
                : item,
            );

            return withTotals(items);
          }

          return withTotals([
            ...state.items,
            {
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
        }),
      removeItem: (productId) =>
        set((state) =>
          withTotals(
            state.items.filter((item) => item.productId !== productId),
          ),
        ),
      increaseQuantity: (productId) =>
        set((state) =>
          withTotals(
            state.items.map((item) =>
              item.productId === productId
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
                item.productId === productId
                  ? { ...item, quantity: item.quantity - 1 }
                  : item,
              )
              .filter((item) => item.quantity > 0),
          ),
        ),
      clearCart: () => set({ items: [], totalItems: 0, subtotal: 0 }),
    }),
    {
      name: "sfstore-cart",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
