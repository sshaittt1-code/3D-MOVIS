export const runUpdateSmoke = async (
  baseUrlInput = process.env.UPDATE_SMOKE_BASE_URL || 'http://127.0.0.1:3000',
  options = {}
) => {
  const { expectApk = false } = options;
  const baseUrl = baseUrlInput.replace(/\/$/, '');

  const manifestResponse = await fetch(`${baseUrl}/api/update-manifest`);
  const manifest = await manifestResponse.json();

  console.log(JSON.stringify({
    endpoint: 'update-manifest',
    status: manifestResponse.status,
    version: manifest?.version,
    versionCode: manifest?.versionCode,
    apkAvailable: Boolean(manifest?.apkAvailable),
    apkUrl: manifest?.apkUrl
  }, null, 2));

  if (!manifestResponse.ok) {
    throw new Error('Update smoke failed: /api/update-manifest did not return 200.');
  }

  if (!manifest?.version || !manifest?.versionCode || !manifest?.apkUrl) {
    throw new Error('Update smoke failed: manifest shape is incomplete.');
  }

  if (expectApk) {
    const apkResponse = await fetch(`${baseUrl}/apk/latest.apk`, { method: 'HEAD' });
    const contentLength = Number.parseInt(apkResponse.headers.get('content-length') || '0', 10);
    console.log(JSON.stringify({
      endpoint: 'apk/latest.apk',
      status: apkResponse.status,
      contentLength
    }, null, 2));

    if (!apkResponse.ok || !Number.isFinite(contentLength) || contentLength <= 0) {
      throw new Error('Update smoke failed: latest APK is not downloadable.');
    }
  }
};

const isDirectRun = process.argv[1]?.endsWith('updateSmoke.mjs');

if (isDirectRun) {
  const expectApk = process.argv.includes('--expect-apk');
  runUpdateSmoke(process.env.UPDATE_SMOKE_BASE_URL, { expectApk }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
