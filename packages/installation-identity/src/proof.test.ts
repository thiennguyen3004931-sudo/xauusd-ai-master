import { describe, expect, it } from "vitest";
import { generateInstallationIdentity } from "./identity.js";
import {
  signInstallationChallenge,
  verifyInstallationChallenge,
  type InstallationChallenge,
} from "./proof.js";

const NOW = Date.parse("2026-09-15T05:40:00.000Z");

function challenge(installationId: string): InstallationChallenge {
  return {
    installationId,
    nonce: "nonce-001",
    issuedAt: NOW - 1_000,
    expiresAt: NOW + 60_000,
  };
}

describe("installation proof of possession", () => {
  it("accepts a valid proof signed by the installation private key", () => {
    const identity = generateInstallationIdentity();
    const proof = signInstallationChallenge(challenge(identity.installationId), identity.privateKey);

    expect(verifyInstallationChallenge(proof, identity.publicKeyPem, NOW)).toBe(true);
  });

  it("rejects tampering, wrong keys, malformed signatures, and expired challenges without throwing", () => {
    const identity = generateInstallationIdentity();
    const other = generateInstallationIdentity();
    const proof = signInstallationChallenge(challenge(identity.installationId), identity.privateKey);

    expect(verifyInstallationChallenge({ ...proof, challenge: { ...proof.challenge, nonce: "changed" } }, identity.publicKeyPem, NOW)).toBe(false);
    expect(verifyInstallationChallenge(proof, other.publicKeyPem, NOW)).toBe(false);
    expect(verifyInstallationChallenge({ ...proof, signature: "not-base64" }, identity.publicKeyPem, NOW)).toBe(false);
    expect(verifyInstallationChallenge(proof, identity.publicKeyPem, proof.challenge.expiresAt + 1)).toBe(false);
  });
});
