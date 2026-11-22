export const CAMPUS_PICKUP_SPOTS = [
  "Main Campus Adssu",
  "Agriculture Dept Stalls",
  "CEIS Lobby",
  "TBI Office",
] as const;

export type CampusPickupSpot = (typeof CAMPUS_PICKUP_SPOTS)[number];

export type BuyerNotificationPreferences = {
  orders: boolean;
  messages: boolean;
};

export const DEFAULT_BUYER_NOTIFICATION_PREFERENCES: BuyerNotificationPreferences =
  {
    orders: true,
    messages: true,
  };

export function parseBuyerNotificationPreferences(
  value: unknown,
): BuyerNotificationPreferences {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_BUYER_NOTIFICATION_PREFERENCES;
  }

  const preferences = value as Record<string, unknown>;
  return {
    orders: preferences.orders !== false,
    messages: preferences.messages !== false,
  };
}

export function isBuyerNotificationEnabled(
  type: string,
  preferences: BuyerNotificationPreferences,
): boolean {
  if (type === "message") return preferences.messages;
  if (type === "order" || type === "payment") return preferences.orders;
  return true;
}
