import { registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { UPDATE_APK_CACHE_PATH } from './updateManager';

export type InstallPermissionStatus = {
  canInstall: boolean;
  needsPermission: boolean;
};

export type ApkVerificationResult = {
  exists: boolean;
  isApk: boolean;
  sizeBytes: number;
  packageName?: string | null;
  versionName?: string | null;
  versionCode?: number | null;
  matchesPackage: boolean;
};

export interface ApkInstallerPlugin {
  getInstallPermissionStatus(): Promise<InstallPermissionStatus>;
  openInstallPermissionSettings(): Promise<void>;
  verifyPackageArchive(options: { filePath: string; packageName?: string; expectedSizeBytes?: number }): Promise<ApkVerificationResult>;
  install(options: { filePath: string }): Promise<void>;
}

export const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller');

export const downloadUpdateApk = async (apkUrl: string) => {
  await Filesystem.downloadFile({
    url: apkUrl,
    path: UPDATE_APK_CACHE_PATH,
    directory: Directory.Cache,
    recursive: true,
    progress: false
  });

  const [uri, stat] = await Promise.all([
    Filesystem.getUri({ path: UPDATE_APK_CACHE_PATH, directory: Directory.Cache }),
    Filesystem.stat({ path: UPDATE_APK_CACHE_PATH, directory: Directory.Cache })
  ]);

  return {
    path: UPDATE_APK_CACHE_PATH,
    uri: uri.uri,
    sizeBytes: stat.size
  };
};

export const removeDownloadedUpdateApk = async () => {
  try {
    await Filesystem.deleteFile({ path: UPDATE_APK_CACHE_PATH, directory: Directory.Cache });
  } catch {
    // Ignore cleanup failures.
  }
};
