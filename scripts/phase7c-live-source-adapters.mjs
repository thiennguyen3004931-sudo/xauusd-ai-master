function requireMarker(source, marker, label) {
  if (!source.includes(marker)) {
    throw new Error(`Phase7C LIVE ${label} adapter marker no longer matches source; refusing LIVE execution.`);
  }
}

export function transformPhase7CTrendLegacySource(source) {
  const allowRealMarker = 'if (allowReal) throw new Error("Phase 7B DEMO refuses MT5_ALLOW_REAL_ACCOUNT=true.");';
  const modeMarker = 'health.accountMode !== "demo"';
  requireMarker(source, allowRealMarker, "Trend");
  requireMarker(source, modeMarker, "Trend");

  let output = source.replace(
    allowRealMarker,
    'if (!allowReal) throw new Error("Phase 7C LIVE Trend requires MT5_ALLOW_REAL_ACCOUNT=true.");',
  );
  output = output.replaceAll('health.accountMode !== "demo"', 'health.accountMode !== "real"');
  output = output.replaceAll('health.accountMode === "demo"', 'health.accountMode === "real"');
  output = output.replaceAll('requires accountMode=demo', 'requires accountMode=real');
  output = output.replaceAll('MT5 DEMO account login is unavailable.', 'MT5 LIVE account login is unavailable.');
  output = output.replaceAll('Add DEMO login', 'Add LIVE login');
  output = output.replaceAll('Current DEMO login', 'Current LIVE login');
  output = output.replaceAll('Demo state belongs to account', 'LIVE state belongs to account');
  output = output.replaceAll('Use the dedicated Phase 7B demo env', 'Use the dedicated Phase 7C LIVE env');
  return output;
}

export function transformPhase7CSidewaySource(source) {
  const allowRealMarker = 'if (allowReal) throw new Error("Phase 7C Sideway controller refuses MT5_ALLOW_REAL_ACCOUNT=true.");';
  const modeMarker = 'health.accountMode !== "demo"';
  requireMarker(source, allowRealMarker, "Sideway");
  requireMarker(source, modeMarker, "Sideway");

  let output = source.replace(
    allowRealMarker,
    'if (!allowReal) throw new Error("Phase 7C LIVE Sideway requires MT5_ALLOW_REAL_ACCOUNT=true.");',
  );
  output = output.replaceAll('health.accountMode !== "demo"', 'health.accountMode !== "real"');
  output = output.replaceAll('health.accountMode === "demo"', 'health.accountMode === "real"');
  output = output.replaceAll('requires accountMode=demo', 'requires accountMode=real');
  output = output.replaceAll('MT5 DEMO account login is unavailable.', 'MT5 LIVE account login is unavailable.');
  output = output.replaceAll('Add DEMO login', 'Add LIVE login');
  output = output.replaceAll('Current DEMO login', 'Current LIVE login');
  return output;
}
