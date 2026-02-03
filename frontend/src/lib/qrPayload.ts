import { deflate, inflate } from "pako";

export const DISPATCH_HUB_QR_PREFIX_COMPRESSED_V1 = "DH1.";

const toBase64Url = (bytes: Uint8Array): string => {
  // Browser-safe base64url (no padding)
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (b64url: string): Uint8Array => {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export type DecodeGatepassQrResult =
  | { kind: "payload"; payload: any }
  | { kind: "gatepassNumber"; gatepassNumber: string }
  | { kind: "invalid"; error: string };

/**
 * Encode a gatepass payload for QR.
 *
 * Strategy:
 * - Try plain JSON (easy to debug)
 * - If too large, deflate+base64url with a version prefix
 * - If still too large, fall back to a minimal JSON reference
 */
export const encodeGatepassQrPayload = (payload: any): string => {
  const json = JSON.stringify(payload);

  // Keep below conservative thresholds for good scan reliability.
  if (json.length <= 2800) return json;

  try {
    const compressed = deflate(json, { level: 9 });
    const token = `${DISPATCH_HUB_QR_PREFIX_COMPRESSED_V1}${toBase64Url(compressed)}`;
    if (token.length <= 3500) return token;
  } catch {
    // ignore; will fall back
  }

  // Minimal fallback (still JSON so generic QR scanners can at least read something).
  const gp =
    typeof payload?.gp === "string"
      ? payload.gp
      : typeof payload?.gatepassNumber === "string"
        ? payload.gatepassNumber
        : "N/A";
  const v = typeof payload?.v === "string" ? payload.v : typeof payload?.vehicleNumber === "string" ? payload.vehicleNumber : "N/A";
  const inv = Array.isArray(payload?.invIds) ? payload.invIds : Array.isArray(payload?.inv) ? payload.inv : [];
  return JSON.stringify({ gp, v, inv });
};

export const decodeGatepassQrValue = (value: string): DecodeGatepassQrResult => {
  const raw = String(value ?? "").trim();
  if (!raw) return { kind: "invalid", error: "Empty QR value" };

  if (raw.startsWith(DISPATCH_HUB_QR_PREFIX_COMPRESSED_V1)) {
    try {
      const b64url = raw.slice(DISPATCH_HUB_QR_PREFIX_COMPRESSED_V1.length);
      const bytes = fromBase64Url(b64url);
      const json = inflate(bytes, { to: "string" }) as unknown as string;
      const payload = JSON.parse(json);
      return { kind: "payload", payload };
    } catch (e: any) {
      return { kind: "invalid", error: `Failed to decode compressed payload: ${e?.message || "unknown error"}` };
    }
  }

  // Plain JSON payload
  try {
    const payload = JSON.parse(raw);
    return { kind: "payload", payload };
  } catch {
    // Not JSON; treat as a gatepass number (manual entry).
    return { kind: "gatepassNumber", gatepassNumber: raw };
  }
};

