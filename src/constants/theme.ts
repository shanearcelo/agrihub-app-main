export const Colors = {
  primary: "#1B4332",
  primaryLight: "#2D6A4F",
  accent: "#F59E0B",
  background: "#F4F7F5",
  card: "#FFFFFF",
  text: "#111827",
  textMuted: "#6B7280",
  border: "#E5E7EB",
  danger: "#DC2626",
  success: "#16A34A",
  badgeGreen: "#DCFCE7",
  light: {
    text: "#111827",
    background: "#F4F7F5",
    backgroundElement: "#FFFFFF",
    backgroundSelected: "#DCFCE7",
    textSecondary: "#6B7280",
  },
  dark: {
    text: "#FFFFFF",
    background: "#111827",
    backgroundElement: "#1F2937",
    backgroundSelected: "#1B4332",
    textSecondary: "#9CA3AF",
  },
};

export const Fonts = {
  mono: "SpaceMono",
};

export type ThemeColor = keyof typeof Colors.light;

export const MaxContentWidth = 960;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
};
