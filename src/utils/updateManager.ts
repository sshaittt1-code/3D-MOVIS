import { isRemoteVersionNewer } from './version';

export type UpdateManifest = {
  version: string;
  versionCode: number;
  publishedAt: string;
  apkUrl: string;
  notes: string[];
  mandatory: boolean;
  minSupportedVersion: string | null;
  apkAvailable: boolean;
  apkSizeBytes?: number;
  apkSha256?: string | null;
  packageId?: string;
};

export type DownloadedApkInfo = {
  path: string;
  uri: string;
  sizeBytes: number;
  versionName?: string | null;
  versionCode?: number | null;
  packageName?: string | null;
};

export type UpdatePermissionState = 'unknown' | 'granted' | 'needs_permission';
export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up_to_date'
  | 'available'
  | 'downloading'
  | 'ready_to_install'
  | 'installing'
  | 'error';

export type UpdateState = {
  phase: UpdatePhase;
  manifest: UpdateManifest | null;
  error: string | null;
  progressPercent: number | null;
  permissionState: UpdatePermissionState;
  downloadedApk: DownloadedApkInfo | null;
  lastCheckedAt: number | null;
};

export const UPDATE_MANIFEST_PATH = '/api/update-manifest';
export const UPDATE_APK_CACHE_PATH = 'updates/holocinema-latest.apk';
export const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 5;

export const createInitialUpdateState = (): UpdateState => ({
  phase: 'idle',
  manifest: null,
  error: null,
  progressPercent: null,
  permissionState: 'unknown',
  downloadedApk: null,
  lastCheckedAt: null
});

const readString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback;

const readNumber = (value: unknown, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readBoolean = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback;

export const normalizeUpdateManifest = (payload: unknown, baseUrl: string): UpdateManifest | null => {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const version = readString(record.version);
  const versionCode = readNumber(record.versionCode, 0);
  const apkUrlInput = readString(record.apkUrl);
  const publishedAt = readString(record.publishedAt);

  if (!version || !versionCode || !apkUrlInput || !publishedAt) return null;

  const notes = Array.isArray(record.notes)
    ? record.notes.map((note) => readString(note)).filter(Boolean)
    : [];

  return {
    version,
    versionCode,
    publishedAt,
    apkUrl: new URL(apkUrlInput, baseUrl).toString(),
    notes,
    mandatory: readBoolean(record.mandatory),
    minSupportedVersion: readString(record.minSupportedVersion) || null,
    apkAvailable: readBoolean(record.apkAvailable, false),
    apkSizeBytes: readNumber(record.apkSizeBytes, 0) || undefined,
    apkSha256: readString(record.apkSha256) || null,
    packageId: readString(record.packageId) || undefined
  };
};

export const isCurrentVersionSupported = (
  currentVersion: string,
  manifest: Pick<UpdateManifest, 'minSupportedVersion'>
) => {
  if (!manifest.minSupportedVersion) return true;
  return !isRemoteVersionNewer(currentVersion, manifest.minSupportedVersion);
};

export const hasAvailableUpdate = (currentVersion: string, manifest: UpdateManifest | null) =>
  Boolean(manifest?.apkAvailable) && Boolean(manifest) && isRemoteVersionNewer(currentVersion, manifest.version);

export const resolveUpdatePhase = (currentVersion: string, manifest: UpdateManifest | null): UpdatePhase => {
  if (!manifest) return 'error';
  if (!manifest.apkAvailable) return 'idle';
  return hasAvailableUpdate(currentVersion, manifest) ? 'available' : 'up_to_date';
};
