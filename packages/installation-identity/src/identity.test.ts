import { describe, expect, it } from "vitest";
import {
  exportInstallationPublicKey,
  generateInstallationIdentity,
} from "./identity.js";

describe("installation identity", () => {
  it("creates unique installation ids and Ed25519 keypairs without serializing the private key", () => {
    const a = generateInstallationIdentity();
    const b = generateInstallationIdentity();

    expect(a.installationId).not.toBe(b.installationId);
    expect(exportInstallationPublicKey(a)).not.toBe(exportInstallationPublicKey(b));
    expect(a.privateKey.type).toBe("private");
    expect(a.privateKey.asymmetricKeyType).toBe("ed25519");
    expect(a.publicKeyPem).toContain("PUBLIC KEY");
    expect(JSON.stringify(a)).not.toContain("privateKey");
  });
});
