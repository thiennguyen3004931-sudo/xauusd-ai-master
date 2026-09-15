import { generateKeyPairSync, randomUUID } from "node:crypto";
import type { KeyObject } from "node:crypto";

export interface InstallationIdentity {
  installationId: string;
  publicKeyPem: string;
  readonly privateKey: KeyObject;
}

export function generateInstallationIdentity(): InstallationIdentity {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const identity = {
    installationId: randomUUID(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  } as InstallationIdentity;

  Object.defineProperty(identity, "privateKey", {
    value: privateKey,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return identity;
}

export function exportInstallationPublicKey(identity: InstallationIdentity): string {
  return identity.publicKeyPem;
}
