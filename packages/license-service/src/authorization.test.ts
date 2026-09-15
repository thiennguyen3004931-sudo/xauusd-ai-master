import { describe, expect, it } from "vitest";
import type { LicenseRecord } from "./license.js";
import { authorizeLicenseAction } from "./authorization.js";

const validLicense: LicenseRecord = {
  licenseId: "lic-0001",
  status: "ACTIVE",
  customerId: "cust-0001",
  allowedMt5Logins: [12345678],
  allowedBrokerServers: ["Broker-Live"],
  installationId: "inst-0001",
  installationPublicKey: "device-public-key-placeholder",
  plan: "STANDARD",
  maxAccounts: 1,
  issuedAt: 1_789_000_000_000,
  expiresAt: 1_791_592_000_000,
  revokedAt: null
};

const validRequest = {
  installationId: "inst-0001",
  mt5Login: 12345678,
  brokerServer: "Broker-Live",
  action: "POSITION_OPEN" as const,
  masterPositionRef: "master-pos-1",
  now: 1_789_000_010_000
};

describe("active license authorization", () => {
  it("authorizes a matching active license", () => {
    expect(authorizeLicenseAction(validLicense, validRequest)).toEqual({
      ok: true,
      code: "AUTHORIZED",
      effectiveStatus: "ACTIVE"
    });
  });

  it("rejects an installation mismatch", () => {
    expect(
      authorizeLicenseAction(validLicense, {
        ...validRequest,
        installationId: "inst-other"
      })
    ).toEqual({
      ok: false,
      code: "INSTALLATION_MISMATCH"
    });
  });

  it("rejects an MT5 login outside the explicit allowlist", () => {
    expect(
      authorizeLicenseAction(validLicense, {
        ...validRequest,
        mt5Login: 87654321
      })
    ).toEqual({
      ok: false,
      code: "MT5_LOGIN_NOT_ALLOWED"
    });
  });

  it("rejects a broker server outside the explicit allowlist", () => {
    expect(
      authorizeLicenseAction(validLicense, {
        ...validRequest,
        brokerServer: "Broker-Demo"
      })
    ).toEqual({
      ok: false,
      code: "BROKER_SERVER_NOT_ALLOWED"
    });
  });

  it("rejects use before issuedAt", () => {
    expect(
      authorizeLicenseAction(validLicense, {
        ...validRequest,
        now: validLicense.issuedAt - 1
      })
    ).toEqual({
      ok: false,
      code: "LICENSE_NOT_YET_VALID"
    });
  });

  it("treats an elapsed stored ACTIVE license as effectively EXPIRED", () => {
    expect(
      authorizeLicenseAction(validLicense, {
        ...validRequest,
        now: validLicense.expiresAt
      })
    ).toEqual({
      ok: false,
      code: "LICENSE_NOT_ACTIVE",
      effectiveStatus: "EXPIRED"
    });
  });

  it("fails closed on an unknown runtime action", () => {
    expect(
      authorizeLicenseAction(validLicense, {
        ...validRequest,
        action: "RUN_STRATEGY"
      } as never)
    ).toEqual({
      ok: false,
      code: "INVALID_REQUEST"
    });
  });

  it("fails closed on a blank master position reference", () => {
    expect(
      authorizeLicenseAction(validLicense, {
        ...validRequest,
        masterPositionRef: ""
      })
    ).toEqual({
      ok: false,
      code: "INVALID_REQUEST"
    });
  });

  it("fails closed on a malformed runtime license", () => {
    expect(
      authorizeLicenseAction(
        { ...validLicense, allowedMt5Logins: [] } as LicenseRecord,
        validRequest
      )
    ).toEqual({
      ok: false,
      code: "INVALID_LICENSE_RECORD"
    });
  });
});
