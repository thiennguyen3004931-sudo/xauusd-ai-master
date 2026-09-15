import { createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { canonicalizeJson, type JsonValue } from "@xauusd/copy-protocol";

export interface InstallationChallenge {
  readonly installationId: string;
  readonly nonce: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export interface SignedInstallationChallenge {
  readonly challenge: InstallationChallenge;
  readonly signature: string;
}

function assertChallenge(value: unknown): asserts value is InstallationChallenge {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("installation challenge must be an object");
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(",") !== "expiresAt,installationId,issuedAt,nonce") {
    throw new TypeError("installation challenge fields are invalid");
  }

  if (typeof record.installationId !== "string" || record.installationId.trim().length === 0) {
    throw new TypeError("installationId must be non-blank");
  }
  if (typeof record.nonce !== "string" || record.nonce.trim().length === 0) {
    throw new TypeError("nonce must be non-blank");
  }
  if (!Number.isSafeInteger(record.issuedAt) || !Number.isSafeInteger(record.expiresAt)) {
    throw new TypeError("challenge timestamps must be safe integers");
  }
  if ((record.expiresAt as number) <= (record.issuedAt as number)) {
    throw new TypeError("expiresAt must be greater than issuedAt");
  }
}

function challengeBytes(challenge: InstallationChallenge): Uint8Array {
  assertChallenge(challenge);
  return new TextEncoder().encode(canonicalizeJson(challenge as unknown as JsonValue));
}

function decodeSignature(signature: string): Buffer {
  if (
    typeof signature !== "string" ||
    signature.length === 0 ||
    signature.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)
  ) {
    throw new TypeError("signature must be canonical base64");
  }

  const decoded = Buffer.from(signature, "base64");
  if (decoded.length !== 64 || decoded.toString("base64") !== signature) {
    throw new TypeError("signature must be a 64-byte Ed25519 signature");
  }
  return decoded;
}

export function signInstallationChallenge(
  challenge: InstallationChallenge,
  privateKey: KeyObject
): SignedInstallationChallenge {
  if (privateKey.type !== "private" || privateKey.asymmetricKeyType !== "ed25519") {
    throw new TypeError("privateKey must be an Ed25519 private key");
  }

  const signature = sign(null, challengeBytes(challenge), privateKey).toString("base64");
  return { challenge, signature };
}

export function verifyInstallationChallenge(
  proof: SignedInstallationChallenge,
  publicKeyPem: string,
  now: number
): boolean {
  try {
    if (!Number.isSafeInteger(now)) {
      return false;
    }
    assertChallenge(proof.challenge);
    if (now < proof.challenge.issuedAt || now > proof.challenge.expiresAt) {
      return false;
    }

    const signature = decodeSignature(proof.signature);
    const publicKey = createPublicKey(publicKeyPem);
    if (publicKey.type !== "public" || publicKey.asymmetricKeyType !== "ed25519") {
      return false;
    }

    return verify(null, challengeBytes(proof.challenge), publicKey, signature);
  } catch {
    return false;
  }
}
