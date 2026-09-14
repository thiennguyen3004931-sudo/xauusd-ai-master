import type { CopyCommandBody, JsonValue } from "./command.js";
import { assertCopyCommandBody } from "./command.js";

export function canonicalizeJson(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical JSON number must be finite");
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }

  if (typeof value !== "object") {
    throw new TypeError("canonical JSON value is unsupported");
  }

  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key]!)}`)
    .join(",")}}`;
}

export function canonicalizeCopyCommandBody(body: CopyCommandBody): string {
  assertCopyCommandBody(body);
  return canonicalizeJson(body as unknown as JsonValue);
}

export function copyCommandSigningBytes(body: CopyCommandBody): Uint8Array {
  return new TextEncoder().encode(canonicalizeCopyCommandBody(body));
}
