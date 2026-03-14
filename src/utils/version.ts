export const normalizeVersion = (version: string | null | undefined): number[] | null => {
  if (!version) return null;

  const cleaned = version.trim().replace(/^[^\d]*/, '');
  if (!cleaned) return null;

  const parts = cleaned.split('.').map((part) => {
    const match = part.match(/\d+/);
    return match ? Number.parseInt(match[0], 10) : Number.NaN;
  });

  if (parts.length === 0 || parts.some(Number.isNaN)) return null;
  return parts;
};

export const compareVersions = (left: string | null | undefined, right: string | null | undefined): number => {
  const normalizedLeft = normalizeVersion(left);
  const normalizedRight = normalizeVersion(right);

  if (!normalizedLeft || !normalizedRight) return 0;

  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = normalizedLeft[index] ?? 0;
    const rightPart = normalizedRight[index] ?? 0;

    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
};

export const isRemoteVersionNewer = (currentVersion: string, remoteVersion: string | null | undefined) =>
  compareVersions(remoteVersion, currentVersion) > 0;
