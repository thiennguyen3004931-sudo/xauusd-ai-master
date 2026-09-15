import { describe, expect, it } from "vitest";
import {
  exportInstallationPublicKey,
  generateInstallationIdentity,
} from "./identity.js";

describe("installation identity", () => {
  it("creates unique installation ids and Ed25519 keypairs", () => {
    const a = generateInstallationIdentity();
    const b = generateInstallationIdentity();

    expect(a.installationId).not.toBe(b.installationId);
    expect(exportInstallationPublicKey(a)).not.toBe(exportInstallationPublicKey(b));
    expect(a.privateKeyPem).toContain("PRIVATE KEY");
    expect(a.publicKeyPem).toContain("PUBLIC KEY");
  });
});
