import { describe, expect, it } from "vitest";
import { generateInstallationIdentity } from "./identity.js";
import { signInstallationChallenge } from "./proof.js";
import {
  InMemoryInstallationEnrollmentRepository,
  enrollInstallation,
  validateEnrollmentProof,
} from "./enrollment.js";

const NOW = Date.parse("2026-09-15T05:45:00.000Z");

function requestFor(licenseId: string, identity: ReturnType<typeof generateInstallationIdentity>) {
  const challenge = {
    installationId: identity.installationId,
    nonce: "enroll-nonce-001",
    issuedAt: NOW - 1_000,
    expiresAt: NOW + 60_000,
  } as const;

  return {
    licenseId,
    publicKeyPem: identity.publicKeyPem,
    proof: signInstallationChallenge(challenge, identity.privateKey),
  };
}

describe("installation enrollment", () => {
  it("stores only public installation binding after valid proof", () => {
    const identity = generateInstallationIdentity();
    const repository = new InMemoryInstallationEnrollmentRepository();
    const request = requestFor("lic-001", identity);

    expect(validateEnrollmentProof(request, NOW)).toBe(true);
    expect(enrollInstallation(repository, request, NOW)).toEqual({ status: "ENROLLED" });

    const record = repository.get(identity.installationId);
    expect(record).toMatchObject({
      installationId: identity.installationId,
      licenseId: "lic-001",
      publicKeyPem: identity.publicKeyPem,
      enrolledAt: NOW,
    });
    expect(JSON.stringify(record)).not.toContain("privateKey");
  });

  it("rejects invalid proof and a duplicate installation id bound to a different key", () => {
    const identity = generateInstallationIdentity();
    const other = generateInstallationIdentity();
    const repository = new InMemoryInstallationEnrollmentRepository();

    expect(enrollInstallation(repository, requestFor("lic-001", identity), NOW)).toEqual({ status: "ENROLLED" });

    const forged = requestFor("lic-001", other);
    forged.proof = {
      ...forged.proof,
      challenge: { ...forged.proof.challenge, installationId: identity.installationId },
    };
    expect(enrollInstallation(repository, forged, NOW)).toEqual({ status: "INVALID_PROOF" });

    const validOtherKeyForSameId = requestFor("lic-001", other);
    const challenge = {
      ...validOtherKeyForSameId.proof.challenge,
      installationId: identity.installationId,
    };
    validOtherKeyForSameId.proof = signInstallationChallenge(challenge, other.privateKey);
    expect(enrollInstallation(repository, validOtherKeyForSameId, NOW)).toEqual({ status: "INSTALLATION_KEY_CONFLICT" });
  });

  it("is idempotent for the same installation, key, and license binding", () => {
    const identity = generateInstallationIdentity();
    const repository = new InMemoryInstallationEnrollmentRepository();
    const request = requestFor("lic-001", identity);

    expect(enrollInstallation(repository, request, NOW)).toEqual({ status: "ENROLLED" });
    expect(enrollInstallation(repository, request, NOW)).toEqual({ status: "ALREADY_ENROLLED" });
  });
});
