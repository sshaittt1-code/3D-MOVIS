import React from 'react';
import { Film, Loader2, Search, Settings, X } from 'lucide-react';
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
  telegramPanelContent?: React.ReactNode;
  updatesPanelContent?: React.ReactNode;
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
  apiBase,
  telegramPanelContent,
  updatesPanelContent
}: AppSettingsPanelProps) => (
  <div className="hc-screen-overlay" data-tv-scope="ui">
    <div className="hc-panel hc-panel--wide p-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="hc-badge">
            <Settings size={16} />
            <span>System Console</span>
          </div>
          <h2 className="mt-4 text-4xl font-bold text-white">הגדרות המערכת</h2>
          <p className="hc-subtitle mt-3 max-w-2xl text-base">
            מעטפת אחת ברורה ויציבה להגדרות, חיבורי מקורות, עדכונים וניהול חוויית Android TV.
          </p>
        </div>
        <button onClick={onClose} className="hc-close-button p-3" aria-label="סגור הגדרות">
          <X size={22} />
        </button>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {tabs.map((tab) => {
          const active = tab.id === panel;
          return (
            <button
              key={tab.id}
              onClick={() => onPanelChange(tab.id)}
              className={`hc-tab px-5 py-3 text-sm ${active ? 'is-active' : ''}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {panel === 'general' && (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section className="hc-panel-section p-6">
            <div className="flex items-center gap-3 text-white">
              <Film size={18} className="text-[#7debd6]" />
              <h3 className="text-2xl font-semibold">מסדרון ופוסטרים</h3>
            </div>
            <p className="hc-subtitle mt-3 text-sm">
              שליטה על רוחב הטעינה הראשוני כדי להתאים את המסדרון גם לסטרימרים חלשים וגם למכשירים חזקים יותר.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {posterBatchOptions.map((value) => (
                <button
                  key={value}
                  onClick={() => onPosterBatchSizeChange(value)}
                  className={`hc-pill px-4 py-2 text-sm ${posterBatchSize === value ? 'is-active' : ''}`}
                >
                  {value} פוסטרים
                </button>
              ))}
            </div>
          </section>

          <section className="hc-panel-section p-6">
            <div className="flex items-center gap-3 text-white">
              <Search size={18} className="text-[#7debd6]" />
              <h3 className="text-2xl font-semibold">התנהגות צפייה</h3>
            </div>
            <p className="hc-subtitle mt-3 text-sm">
              בחירה אם להכין אוטומטית את הפרק הבא כשמשתמש צופה בסדרה, כדי לשמור על זרימת binge חלקה.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => onAutoPlayNextEpisodeChange(true)}
                className={`hc-pill px-5 py-3 text-sm ${autoPlayNextEpisode ? 'is-active' : ''}`}
              >
                הפעלה אוטומטית
              </button>
              <button
                onClick={() => onAutoPlayNextEpisodeChange(false)}
                className={`hc-pill px-5 py-3 text-sm ${!autoPlayNextEpisode ? 'is-active' : ''}`}
              >
                בחירה ידנית
              </button>
            </div>
          </section>
        </div>
      )}

      {panel === 'telegram' && (
        telegramPanelContent ?? (
          <div className="hc-panel-section mt-8 p-6">
            <div className="flex items-center gap-3 text-white">
              <Loader2 size={18} className="text-[#7debd6]" />
              <h3 className="text-2xl font-semibold">מעטפת Telegram</h3>
            </div>
            <p className="hc-subtitle mt-3 max-w-3xl text-sm">
              חיבור מלא למקורות, התחברות, חיפוש וניגון ישיר זמינים כאן כשהם משולבים במעטפת הראשית.
            </p>
            <div className="hc-meter mt-6 text-sm text-white">
              <span className={`h-2.5 w-2.5 rounded-full ${telegramStatusTone}`} />
              <span>{telegramStatusLabel}</span>
            </div>
          </div>
        )
      )}

      {panel === 'updates' && (
        updatesPanelContent ?? (
          <div className="hc-panel-section mt-8 p-6">
            <div className="flex items-center gap-3 text-white">
              <Settings size={18} className="text-[#7debd6]" />
              <h3 className="text-2xl font-semibold">סביבת הרצה ועדכונים</h3>
            </div>
            <p className="hc-subtitle mt-3 text-sm">
              מסך ייצוב לעדכונים, כתובת ה-API הפעילה, ובסיס לשחרור גרסאות חדשות בצורה בטוחה מתוך האפליקציה.
            </p>
            <div className="hc-card mt-6 px-5 py-4 text-sm text-white/75">
              <div className="text-white/50">API Base</div>
              <div className="mt-2 break-all text-white">{apiBase}</div>
            </div>
          </div>
        )
      )}
    </div>
  </div>
);
