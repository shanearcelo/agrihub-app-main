type ProductImageFields = {
  image_url?: string | null;
  image_urls?: unknown;
};

type FeaturedProductFields = {
  is_featured?: boolean | null;
  featured_status?: string | null;
  featured_expires_at?: string | null;
};

export function getProductImageUrls(product: ProductImageFields): string[] {
  if (Array.isArray(product.image_urls)) {
    const urls = product.image_urls.filter(
      (url): url is string => typeof url === "string" && url.length > 0,
    );
    if (urls.length > 0) return urls;
  }
  return product.image_url ? [product.image_url] : [];
}

export function isProductFeatured(product: FeaturedProductFields): boolean {
  return (
    product.is_featured === true &&
    product.featured_status === "active" &&
    Boolean(
      product.featured_expires_at &&
        new Date(product.featured_expires_at).getTime() > Date.now(),
    )
  );
}
