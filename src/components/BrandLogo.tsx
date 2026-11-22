import { Image, type ImageStyle, type StyleProp } from "react-native";

type BrandLogoProps = {
  size: number;
  style?: StyleProp<ImageStyle>;
};

export function BrandLogo({ size, style }: BrandLogoProps) {
  return (
    <Image
      accessible
      accessibilityLabel="AgriHub logo"
      resizeMode="cover"
      source={require("../../assets/images/agrihub-logo-circle.png")}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}
