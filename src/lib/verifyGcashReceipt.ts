// src/lib/verifyGcashReceipt.ts
import { createWorker } from "tesseract.js";
import { supabase } from "./supabase";

export const OFFICIAL_GCASH_NAME = "BABY SHANE ARCELO";
export const OFFICIAL_GCASH_NUMBER = "09938329608";
const OFFICIAL_GCASH_SUFFIX = "938329608";

export interface ReceiptVerificationResult {
  isValid: boolean;
  needsManualReview?: boolean;
  reason?: string;
  referenceNumber?: string;
}

async function assetToDataUrl(
  uri: string,
  base64?: string | null,
  mimeType?: string | null,
): Promise<string> {
  if (base64) {
    const clean = base64.replace(/\s/g, "");
    return clean.startsWith("data:")
      ? clean
      : `data:${mimeType || "image/jpeg"};base64,${clean}`;
  }
  const res = await fetch(uri);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read image."));
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(blob);
  });
}

async function enhanceLowLightImage(rawDataUrl: string): Promise<string> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return rawDataUrl;
  }
  return new Promise<string>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      try {
        const maxDim = 1400;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not prepare receipt image for OCR.");

        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        let minLuma = 255;
        let maxLuma = 0;

        for (let i = 0; i < data.length; i += 4) {
          const luma =
            0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (luma < minLuma) minLuma = luma;
          if (luma > maxLuma) maxLuma = luma;
        }

        const range = Math.max(1, maxLuma - minLuma);
        for (let i = 0; i < data.length; i += 4) {
          const luma =
            0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const stretched = Math.min(
            255,
            Math.max(0, Math.round(((luma - minLuma) / range) * 255)),
          );
          data[i] = stretched;
          data[i + 1] = stretched;
          data[i + 2] = stretched;
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () =>
      reject(new Error("Could not load receipt image for OCR."));
    img.src = rawDataUrl;
  });
}

async function recognizeReceiptText(dataUrl: string): Promise<string> {
  if (typeof Worker !== "undefined") {
    const worker = await createWorker("eng");
    try {
      const {
        data: { text },
      } = await worker.recognize(dataUrl);
      return text || "";
    } finally {
      await worker.terminate();
    }
  }

  // Mobile fallback (Expo Go / iOS / Android) where Web Workers do not exist
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const formData = new FormData();
    formData.append("apikey", "helloworld");
    formData.append("language", "eng");
    formData.append("isOverlayRequired", "false");
    formData.append("OCREngine", "2");
    formData.append("scale", "true");
    formData.append("base64Image", dataUrl);

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) return "";
    const json = await response.json();
    const parsedResults = Array.isArray(json?.ParsedResults)
      ? json.ParsedResults
      : [];
    return parsedResults
      .map((item: { ParsedText?: string }) => item?.ParsedText || "")
      .join("\n");
  } catch {
    return "";
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function verifyGcashReceiptImage(
  asset: { uri: string; base64?: string | null; mimeType?: string | null },
  expectedAmount: number,
): Promise<ReceiptVerificationResult> {
  if (!asset.uri) {
    return {
      isValid: false,
      reason: "Choose a receipt photo before submitting payment.",
    };
  }

  try {
    const rawDataUrl = await assetToDataUrl(
      asset.uri,
      asset.base64,
      asset.mimeType,
    );

    const preparedDataUrl = await enhanceLowLightImage(rawDataUrl);
    const rawText = await recognizeReceiptText(preparedDataUrl);

    const normalizedText = rawText.replace(/\s+/g, " ").trim();
    if (!normalizedText) {
      if (typeof Worker === "undefined") {
        return {
          isValid: true,
          needsManualReview: true,
          reason:
            "Automatic receipt scanning could not read this image on mobile. The attached receipt will be submitted for Admin review.",
        };
      }
      return {
        isValid: false,
        reason:
          "Receipt is unclear or not readable. Please upload a clearer GCash receipt screenshot.",
      };
    }

    const hasTransferIndicator =
      /gcash|express\s*send|total\s*amount\s*sent|amount\s*sent|sent\s*via|ref\s*n[o0]|ret\s*n[o0]|reference/i.test(
        normalizedText,
      );
    if (!hasTransferIndicator) {
      return {
        isValid: false,
        reason:
          "Receipt is not readable as a valid GCash transfer. Please upload an official GCash receipt.",
      };
    }

    // If a recipient mobile number is visible on the receipt, ensure it matches 0993 832 9608
    const phoneMatches = normalizedText.match(
      /(?:09|\+?63\s*9)\d[\d\s-]{7,11}\d/g,
    );
    if (phoneMatches && phoneMatches.length > 0) {
      const normalizedPhones = phoneMatches.map((p) => p.replace(/\D/g, ""));
      const matchesOfficialRecipient = normalizedPhones.some((digits) =>
        digits.endsWith(OFFICIAL_GCASH_SUFFIX),
      );
      if (!matchesOfficialRecipient) {
        return {
          isValid: false,
          reason: `This receipt was sent to a different GCash number. Please send ₱${expectedAmount}.00 to ${OFFICIAL_GCASH_NAME} (${OFFICIAL_GCASH_NUMBER}).`,
        };
      }
    }

    const refLabelMatch = normalizedText.match(
      /(?:(?:ref|ret)\s*n[o0]|reference(?:\s*(?:no|number))?)\.?\s*[:#\s,.-]*((?:\d[\s-]*){8,16})/i,
    );
    const refCandidate = refLabelMatch
      ? refLabelMatch[1].replace(/\D/g, "")
      : normalizedText.match(/\b(\d{12,14})\b/)?.[1];
    let referenceNumber =
      refCandidate && refCandidate.length >= 8 && refCandidate.length <= 16
        ? refCandidate
        : undefined;

    const amountPattern = new RegExp(
      `(?:^|[^\\d])(?:₱|PHP|P)?\\s*${expectedAmount}(?:[.,]00)?(?!\\d)`,
      "i",
    );
    const hasExpectedAmount = amountPattern.test(normalizedText);
    if (!referenceNumber && !hasExpectedAmount) {
      return {
        isValid: false,
        reason: `Receipt must show a reference number or the expected amount ₱${expectedAmount}.00.`,
      };
    }

    if (referenceNumber) {
      const cleanRef = referenceNumber.replace(/\D/g, "");
      const { data: alreadyUsed, error: dupCheckError } = await supabase.rpc(
        "check_gcash_reference_used",
        { p_reference_number: cleanRef },
      );
      if (dupCheckError) {
        return {
          isValid: false,
          reason: `Could not verify receipt uniqueness: ${dupCheckError.message}`,
        };
      }
      if (alreadyUsed === true) {
        return {
          isValid: false,
          reason: `This GCash receipt (Ref No. ${cleanRef}) has already been used. Please upload a new payment receipt.`,
        };
      }
      referenceNumber = cleanRef;
    }

    return {
      isValid: true,
      needsManualReview: !referenceNumber,
      referenceNumber,
    };
  } catch (error) {
    return {
      isValid: true,
      needsManualReview: true,
      reason: `Automatic receipt scanning could not complete${
        error instanceof Error ? `: ${error.message}` : "."
      } The attached receipt will be submitted for Admin review.`,
    };
  }
}
