import React from 'react';
import { Loader2, Settings, Search, Film, X } from 'lucide-react';
import type { SettingsPanel } from '../utils/menuConfig';

type AppSettingsPanelProps = {
  panel: SettingsPanel;
  tabs: Array<{ id: SettingsPanel; label: string }>;
  onPanelChange: (panel: SettingsPanel) => void;
  onClose: () => void;
  posterBatchSize: number;
  posterBatchOptions: readonly number[];
  onPosterBatchSizeChange: (value: number) => void;
  autoPlayNextEpisode: boolean;
  onAutoPlayNextEpisodeChange: (value: boolean) => void;
  telegramStatusLabel: string;
  telegramStatusTone: string;
  apiBase: string;
};

export const AppSettingsPanel = ({
  panel,
  tabs,
  onPanelChange,
  onClose,
  posterBatchSize,
  posterBatchOptions,
  onPosterBatchSizeChange,
  autoPlayNextEpisode,
  onAutoPlayNextEpisodeChange,
  telegramStatusLabel,
  telegramStatusTone,
  apiBase
}: AppSettingsPanelProps) => (
  <div className="absolute inset-0 z-[120] flex items-center justify-center bg-black/88 p-8" data-tv-scope="ui">
    <div className="w-full max-w-5xl rounded-[42px] border border-[#00ffcc]/20 bg-[linear-gradient(180deg,rgba(8,16,20,0.98),rgba(4,8,12,0.94))] p-8 shadow-[0_0_80px_rgba(0,0,0,0.5)]">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-3 rounded-full border border-[#00ffcc]/20 bg-[#00ffcc]/8 px-4 py-2 text-sm text-[#7debd6]">
            <Settings size={16} />
            <span>System Console</span>
          </div>
          <h2 className="mt-4 text-4xl font-bold text-white">הגדרות המערכת</h2>
          <p className="mt-3 max-w-2xl text-base text-white/60">
            שלב הייצוב של המוצר: מעטפת הגדרות אחת, ברורה ויציבה, שמחזיקה את חוויית ה־Android TV בלי מצבים מתים.
          </p>
        </div>
        <button onClick={onClose} className="rounded-full border border-white/10 bg-white/5 p-3 text-white/70 transition hover:bg-white/10 hover:text-white">
          <X size={22} />
        </button>
      </div>

      <div className="mt-8 flex gap-3">
        {tabs.map((tab) => {
          const active = tab.id === panel;
          return (
            <button
              key={tab.id}
              onClick={() => onPanelChange(tab.id)}
              className={`rounded-full border px-5 py-3 text-sm transition ${
                active
                  ? 'border-[#00ffcc]/35 bg-[#00ffcc]/15 text-white shadow-[0_0_24px_rgba(0,255,204,0.14)]'
                  : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/8'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {panel === 'general' && (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section className="rounded-[30px] border border-white/8 bg-white/[0.03] p-6">
            <div className="flex items-center gap-3 text-white">
              <Film size={18} className="text-[#7debd6]" />
              <h3 className="text-2xl font-semibold">מסדרון ופוסטרים</h3>
            </div>
            <p className="mt-3 text-sm leading-7 text-white/60">
              שליטה ברוחב הטעינה הראשוני, כדי להתאים את המסדרון גם לסטרימרים חלשים וגם למכשירים חזקים יותר.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {posterBatchOptions.map((value) => (
                <button
                  key={value}
                  onClick={() => onPosterBatchSizeChange(value)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    posterBatchSize === value
                      ? 'border-[#00ffcc]/30 bg-[#00ffcc]/16 text-white'
                      : 'border-white/10 bg-black/20 text-white/70 hover:bg-white/8'
                  }`}
                >
                  {value} פוסטרים
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[30px] border border-white/8 bg-white/[0.03] p-6">
            <div className="flex items-center gap-3 text-white">
              <Search size={18} className="text-[#7debd6]" />
              <h3 className="text-2xl font-semibold">התנהגות צפייה</h3>
            </div>
            <p className="mt-3 text-sm leading-7 text-white/60">
              בחירה אם להכין אוטומטית את הפרק הבא כשהמשתמש צופה בסדרה, כדי לשמור על חוויית binge חלקה.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => onAutoPlayNextEpisodeChange(true)}
                className={`rounded-full border px-5 py-3 text-sm transition ${
                  autoPlayNextEpisode
                    ? 'border-[#00ffcc]/30 bg-[#00ffcc]/16 text-white'
                    : 'border-white/10 bg-black/20 text-white/70 hover:bg-white/8'
                }`}
              >
                הפעלה אוטומטית
              </button>
              <button
                onClick={() => onAutoPlayNextEpisodeChange(false)}
                className={`rounded-full border px-5 py-3 text-sm transition ${
                  !autoPlayNextEpisode
                    ? 'border-[#00ffcc]/30 bg-[#00ffcc]/16 text-white'
                    : 'border-white/10 bg-black/20 text-white/70 hover:bg-white/8'
                }`}
              >
                בחירה ידנית
              </button>
            </div>
          </section>
        </div>
      )}

      {panel === 'telegram' && (
        <div className="mt-8 rounded-[30px] border border-white/8 bg-white/[0.03] p-6">
          <div className="flex items-center gap-3 text-white">
            <Loader2 size={18} className="text-[#7debd6]" />
            <h3 className="text-2xl font-semibold">מעטפת Telegram</h3>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/60">
            שלב 1 מייצב את מעטפת המוצר. החיבור המלא למקורות, login flow וניגון ישיר יועמקו בשלבי Telegram ו־Player, אבל כאן כבר יש נקודת כניסה יציבה וברורה.
          </p>
          <div className="mt-6 inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm text-white">
            <span className={`h-2.5 w-2.5 rounded-full ${telegramStatusTone}`} />
            <span>{telegramStatusLabel}</span>
          </div>
        </div>
      )}

      {panel === 'updates' && (
        <div className="mt-8 rounded-[30px] border border-white/8 bg-white/[0.03] p-6">
          <div className="flex items-center gap-3 text-white">
            <Settings size={18} className="text-[#7debd6]" />
            <h3 className="text-2xl font-semibold">סביבת הרצה ועדכונים</h3>
          </div>
          <p className="mt-3 text-sm leading-7 text-white/60">
            מסך ייצוב להרצה ולשחרור: כתובת ה־API הפעילה, build ל־APK, והבסיס למסכי עדכון מתקדמים בשלבים הבאים.
          </p>
          <div className="mt-6 rounded-[24px] border border-white/8 bg-black/20 px-5 py-4 text-sm text-white/75">
            <div className="text-white/50">API Base</div>
            <div className="mt-2 break-all text-white">{apiBase}</div>
          </div>
        </div>
      )}
    </div>
  </div>
);
