import React from 'react';
import { Download, Loader2, RefreshCw, ShieldCheck, UploadCloud } from 'lucide-react';
import type { UpdateManifest, UpdatePhase, UpdatePermissionState } from '../utils/updateManager';

type UpdateConsolePanelProps = {
  currentVersion: string;
  currentBuild: string;
  packageId: string;
  phase: UpdatePhase;
  permissionState: UpdatePermissionState;
  manifest: UpdateManifest | null;
  error: string | null;
  lastCheckedAt: number | null;
  onCheck: () => void;
  onStartUpdate: () => void;
  onInstall: () => void;
  onOpenPermissionSettings: () => void;
};

const formatDateTime = (value: number | string | null | undefined) => {
  if (!value) return 'Not checked yet';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const UpdateConsolePanel = ({
  currentVersion,
  currentBuild,
  packageId,
  phase,
  permissionState,
  manifest,
  error,
  lastCheckedAt,
  onCheck,
  onStartUpdate,
  onInstall,
  onOpenPermissionSettings
}: UpdateConsolePanelProps) => {
  const busy = phase === 'checking' || phase === 'downloading' || phase === 'installing';
  const hasUpdate = phase === 'available' || phase === 'downloading' || phase === 'ready_to_install' || phase === 'installing';

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
      <section className="hc-panel-section p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="hc-badge">
              <UploadCloud size={16} />
              <span>OTA Release Manager</span>
            </div>
            <h3 className="mt-4 text-2xl font-semibold text-white">עדכוני APK אוטומטיים</h3>
            <p className="hc-subtitle mt-3 max-w-2xl text-sm">
              בדיקת גרסה שקטה, הורדה של ה-APK האחרון, והעברה ל-Android installer בלי לאבד את מצב המשתמש.
            </p>
          </div>
          <button onClick={onCheck} disabled={busy} className="hc-button hc-button--ghost px-4 py-3 text-sm">
            <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
            <span>בדוק עדכונים</span>
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="hc-card px-4 py-4 text-sm text-white/80">
            <div className="text-white/45">Current Version</div>
            <div className="mt-2 text-lg font-semibold text-white">{currentVersion}</div>
            <div className="mt-1 text-xs text-white/45">Build {currentBuild}</div>
          </div>
          <div className="hc-card px-4 py-4 text-sm text-white/80">
            <div className="text-white/45">Package</div>
            <div className="mt-2 break-all text-sm text-white">{packageId}</div>
          </div>
          <div className="hc-card px-4 py-4 text-sm text-white/80">
            <div className="text-white/45">Last Check</div>
            <div className="mt-2 text-sm text-white">{formatDateTime(lastCheckedAt)}</div>
          </div>
        </div>

        {manifest && (
          <div className="hc-card mt-6 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-[#7debd6]">Latest Release</div>
                <div className="mt-2 text-2xl font-semibold text-white">{manifest.version}</div>
                <div className="mt-2 text-sm text-white/55">
                  Build {manifest.versionCode} • {formatDateTime(manifest.publishedAt)}
                </div>
              </div>
              <div className={`hc-meter ${
                hasUpdate
                  ? 'border-[#2AABEE]/30 bg-[#2AABEE]/12 text-white'
                  : 'border-white/10 bg-white/[0.04] text-white/75'
              }`}>
                <span className={`h-2.5 w-2.5 rounded-full ${busy ? 'animate-pulse bg-current' : 'bg-current'}`} />
                <span>
                  {!manifest.apkAvailable
                    ? 'APK not ready on the backend'
                    : hasUpdate
                      ? 'New version is available'
                      : 'You are on the latest version'}
                </span>
              </div>
            </div>

            {manifest.notes.length > 0 && (
              <div className="mt-5 space-y-2 text-sm text-white/70">
                {manifest.notes.map((note, index) => (
                  <div key={`${manifest.version}-${index}`} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                    {note}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-[24px] border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error}
          </div>
        )}
      </section>

      <section className="hc-panel-section p-6">
        <div className="flex items-center gap-3 text-white">
          <ShieldCheck size={18} className="text-[#7debd6]" />
          <h3 className="text-2xl font-semibold">התקנה על Android TV</h3>
        </div>
        <p className="hc-subtitle mt-3 text-sm">
          ההתקנה מתבצעת דרך מתקין Android הרשמי. בפעם הראשונה ייתכן שתידרש הרשאת "מקורות לא ידועים" עבור האפליקציה.
        </p>

        <div className="hc-card mt-6 px-5 py-4 text-sm text-white/75">
          <div className="text-white/45">Install Permission</div>
          <div className="mt-2 text-white">
            {permissionState === 'granted'
              ? 'מוכן להתקין עדכונים'
              : permissionState === 'needs_permission'
                ? 'דרוש אישור התקנה חד-פעמי'
                : 'הסטטוס ייבדק לפני ההתקנה'}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={onStartUpdate}
            disabled={!manifest || !manifest.apkAvailable || busy}
            className="hc-button hc-button--accent px-5 py-4 text-sm"
          >
            {phase === 'downloading' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            <span>{phase === 'downloading' ? 'מוריד את ה-APK החדש...' : 'הורד והתקן את הגרסה החדשה'}</span>
          </button>

          {permissionState === 'needs_permission' && (
            <button onClick={onOpenPermissionSettings} className="hc-button hc-button--ghost px-5 py-4 text-sm">
              <ShieldCheck size={16} />
              <span>פתח הרשאת התקנה</span>
            </button>
          )}

          {phase === 'ready_to_install' && permissionState === 'granted' && (
            <button onClick={onInstall} className="hc-button hc-button--telegram px-5 py-4 text-sm">
              <UploadCloud size={16} />
              <span>התקן עכשיו</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
