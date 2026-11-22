import { decode } from "base64-arraybuffer";
import { supabase } from "./supabase";

const PUBLIC_BUCKETS = new Set([
  "avatars",
  "product-images",
  "review-photos",
  "sponsors",
]);
type ImageContentType = "image/jpeg" | "image/png" | "image/webp";

export type UploadableImageAsset = {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
};

type UploadableImage = string | UploadableImageAsset;

function normalizeContentType(value: string | null | undefined): ImageContentType | null {
  const contentType = value?.split(";")[0].trim().toLowerCase();
  if (contentType === "image/jpg") return "image/jpeg";
  if (
    contentType === "image/jpeg" ||
    contentType === "image/png" ||
    contentType === "image/webp"
  ) {
    return contentType;
  }
  return null;
}

function contentTypeFromUri(uri: string): ImageContentType | null {
  const dataUriMatch = uri.match(/^data:(image\/[^;,]+)/i);
  if (dataUriMatch) return normalizeContentType(dataUriMatch[1]);
  return contentTypeFromPath(uri);
}

function contentTypeFromPath(filePath: string): ImageContentType | null {
  const extension = filePath.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return null;
}

function resolveContentType(
  header: string | null,
  uri: string,
  filePath: string,
): ImageContentType {
  const declaredType = header?.split(";")[0].trim().toLowerCase();
  if (
    declaredType?.startsWith("image/") &&
    !normalizeContentType(declaredType)
  ) {
    throw new Error(
      `Unsupported image format "${declaredType}". Choose a JPEG, PNG, or WebP image.`,
    );
  }
  const uriDataType = uri.match(/^data:(image\/[^;,]+)/i)?.[1]?.toLowerCase();
  if (uriDataType && !normalizeContentType(uriDataType)) {
    throw new Error(
      `Unsupported image format "${uriDataType}". Choose a JPEG, PNG, or WebP image.`,
    );
  }

  const contentType =
    normalizeContentType(header) ??
    contentTypeFromUri(uri) ??
    contentTypeFromPath(filePath);
  if (contentType) return contentType;

  return "image/jpeg";
}

function withContentTypeExtension(
  filePath: string,
  contentType: ImageContentType,
): string {
  const extension =
    contentType === "image/png" ? ".png" :
      contentType === "image/webp" ? ".webp" : ".jpg";
  const lastSlash = filePath.lastIndexOf("/");
  const lastDot = filePath.lastIndexOf(".");
  return lastDot > lastSlash
    ? `${filePath.slice(0, lastDot)}${extension}`
    : `${filePath}${extension}`;
}

export function createImageUploadPath(
  userId: string,
  mimeType?: string | null,
  uniqueSuffix?: string,
): string {
  const folder = userId.trim();
  if (!folder || folder.includes("/") || folder.includes("\\")) {
    throw new Error("A valid user ID is required for image uploads.");
  }
  const contentType = normalizeContentType(mimeType) || "image/jpeg";
  const extension =
    contentType === "image/png" ? "png" :
      contentType === "image/webp" ? "webp" : "jpg";
  const suffix = uniqueSuffix?.replace(/[^a-zA-Z0-9_-]/g, "");
  return `${folder}/${Date.now()}${suffix ? `-${suffix}` : ""}.${extension}`;
}

type LocalImage = { bytes: ArrayBuffer; contentType: ImageContentType };

function readWithXmlHttpRequest(
  uri: string,
  filePath: string,
  contentType: string | null,
): Promise<LocalImage> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.responseType = "arraybuffer";
    request.timeout = 30_000;
    request.onload = () => {
      if (request.status !== 0 && (request.status < 200 || request.status >= 300)) {
        reject(new Error(`Unable to read image file (HTTP ${request.status}).`));
        return;
      }

      const bytes = request.response;
      if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) {
        reject(new Error("The selected image is empty or could not be read."));
        return;
      }
      try {
        resolve({
          bytes,
          contentType: resolveContentType(
            contentType || request.getResponseHeader("content-type"),
            uri,
            filePath,
          ),
        });
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(new Error("Unable to read the selected image."));
    request.ontimeout = () => reject(new Error("Reading the image timed out."));
    request.onabort = () => reject(new Error("Reading the image was canceled."));
    request.open("GET", uri, true);
    request.send();
  });
}

function arrayBufferFromBase64(value: string) {
  const base64 = value.replace(/^data:image\/[^;,]+;base64,/i, "").replace(/\s/g, "");
  const bytes = decode(base64);
  if (bytes.byteLength === 0) {
    throw new Error("The selected image is empty or could not be read.");
  }
  return bytes;
}

async function readLocalImage(
  image: UploadableImage,
  filePath: string,
): Promise<LocalImage> {
  const uri = typeof image === "string" ? image : image.uri;
  const declaredType = typeof image === "string" ? null : image.mimeType || null;
  const base64 = typeof image === "string" ? null : image.base64;

  if (base64) {
    return {
      bytes: arrayBufferFromBase64(base64),
      contentType: resolveContentType(declaredType, uri, filePath),
    };
  }

  const dataUriMatch = uri.match(/^data:(image\/[^;,]+);base64,(.+)$/i);
  if (dataUriMatch) {
    return {
      bytes: arrayBufferFromBase64(dataUriMatch[2]),
      contentType: resolveContentType(dataUriMatch[1], uri, filePath),
    };
  }

  try {
    const response = await fetch(uri);
    if (!response.ok && response.status !== 0) {
      throw new Error(`Unable to read image file (HTTP ${response.status}).`);
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0) {
      throw new Error("The selected image is empty or could not be read.");
    }
    return {
      bytes,
      contentType: resolveContentType(
        declaredType || response.headers.get("content-type"),
        uri,
        filePath,
      ),
    };
  } catch (fetchError) {
    if (/^(blob:|data:)/i.test(uri)) throw fetchError;
    try {
      return await readWithXmlHttpRequest(uri, filePath, declaredType);
    } catch (xhrError) {
      const message =
        xhrError instanceof Error
          ? xhrError.message
          : fetchError instanceof Error
            ? fetchError.message
            : "Unable to read the selected image.";
      throw new Error(`Could not read the selected image: ${message}`);
    }
  }
}

async function uploadBytes(
  bytes: ArrayBuffer,
  bucket: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).upload(filePath, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
}

export async function uploadImageToSupabase(
  image: UploadableImage,
  bucket: string,
  filePath: string,
): Promise<string> {
  if (!PUBLIC_BUCKETS.has(bucket)) {
    throw new Error(`Bucket "${bucket}" is private. Use uploadPrivateImageToSupabase.`);
  }

  const localImage = await readLocalImage(image, filePath);
  const uploadPath = withContentTypeExtension(filePath, localImage.contentType);
  await uploadBytes(localImage.bytes, bucket, uploadPath, localImage.contentType);
  return supabase.storage.from(bucket).getPublicUrl(uploadPath).data.publicUrl;
}

export async function uploadPrivateImageToSupabase(
  image: UploadableImage,
  bucket: "valid-ids" | "id-documents" | "gcash-qrs" | "payment-receipts",
  filePath: string,
): Promise<string> {
  if (PUBLIC_BUCKETS.has(bucket)) {
    throw new Error(`Bucket "${bucket}" is public; use uploadImageToSupabase.`);
  }
  if (
    bucket !== "valid-ids" &&
    bucket !== "id-documents" &&
    bucket !== "gcash-qrs" &&
    bucket !== "payment-receipts"
  ) {
    throw new Error(`Unknown Supabase Storage bucket "${bucket}".`);
  }

  const localImage = await readLocalImage(image, filePath);
  const uploadPath = withContentTypeExtension(filePath, localImage.contentType);
  await uploadBytes(localImage.bytes, bucket, uploadPath, localImage.contentType);
  return uploadPath;
}

export async function uploadBase64ImageToSupabase(
  base64: string,
  bucket: string,
  filePath: string,
): Promise<string> {
  const image = {
    uri: "",
    base64,
    mimeType: contentTypeFromPath(filePath),
  };
  if (PUBLIC_BUCKETS.has(bucket)) {
    return uploadImageToSupabase(image, bucket, filePath);
  }
  if (
    bucket === "valid-ids" ||
    bucket === "id-documents" ||
    bucket === "gcash-qrs" ||
    bucket === "payment-receipts"
  ) {
    return uploadPrivateImageToSupabase(image, bucket, filePath);
  }
  throw new Error(`Unknown Supabase Storage bucket "${bucket}".`);
}

export async function getImageUrl(
  bucket: string,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const storage = supabase.storage.from(bucket);
  if (PUBLIC_BUCKETS.has(bucket)) {
    return storage.getPublicUrl(path).data.publicUrl;
  }
  const { data, error } = await storage.createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
