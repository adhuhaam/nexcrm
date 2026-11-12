const warned = new Set<string>();

/**
 * Read `JACMS_<suffix>` with deprecated fallback from `JACMS_<suffix>`.
 */
export function jacmsEnv(suffix: string): string | undefined {
  const primary = `JACMS_${suffix}`;
  const legacy = `JACMS_${suffix}`;
  if (process.env[primary] !== undefined && process.env[primary] !== "") {
    return process.env[primary];
  }
  const old = process.env[legacy];
  if (old !== undefined && old !== "") {
    if (!warned.has(suffix)) {
      warned.add(suffix);
      console.warn(`[jacms] Deprecated env ${legacy}; use ${primary} instead.`);
    }
    return old;
  }
  return undefined;
}
