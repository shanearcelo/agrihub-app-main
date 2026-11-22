import React, { createContext, useContext, useState } from "react";

export interface CartItem {
  harvestId: string;
  title: string;
  pricePerUnit: number;
  unit: string;
  quantity: number;
  availableStock: number;
  sellerId: string;
  sellerName: string;
  imageUrl?: string;
  listingType?: string;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  updateQuantity: (harvestId: string, quantity: number) => void;
  removeFromCart: (harvestId: string) => void;
  clearCart: () => void;
  totalAmount: number;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  function addToCart(newItem: CartItem) {
    const stock = Number(newItem.availableStock);
    if (!Number.isFinite(stock) || stock <= 0 || newItem.quantity <= 0) return;

    setItems((previous) => {
      const existing = previous.find(
        (item) => item.harvestId === newItem.harvestId,
      );
      const quantity = Math.min(
        stock,
        (existing?.quantity || 0) + newItem.quantity,
      );
      return existing
        ? previous.map((item) =>
            item.harvestId === newItem.harvestId
              ? { ...newItem, quantity }
              : item,
          )
        : [...previous, { ...newItem, quantity }];
    });
  }

  function updateQuantity(harvestId: string, quantity: number) {
    if (quantity <= 0) {
      removeFromCart(harvestId);
      return;
    }
    setItems((previous) =>
      previous.flatMap((item) => {
        if (item.harvestId !== harvestId) return [item];
        const cappedQuantity = Math.min(quantity, item.availableStock);
        return cappedQuantity > 0
          ? [{ ...item, quantity: cappedQuantity }]
          : [];
      }),
    );
  }

  function removeFromCart(harvestId: string) {
    setItems((prev) => prev.filter((i) => i.harvestId !== harvestId));
  }

  function clearCart() {
    setItems([]);
  }

  const totalAmount = items.reduce(
    (sum, item) => sum + item.pricePerUnit * item.quantity,
    0,
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        totalAmount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider.");
  }
  return context;
}
