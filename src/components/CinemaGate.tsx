import React from 'react';
import { Play, Settings, X } from 'lucide-react';

type CinemaGateProps = {
  title: string;
  onOpenTelegramPanel: () => void;
  onOpenGeneralSettings: () => void;
  onBackToDetails: () => void;
};

export const CinemaGate = ({
  title,
  onOpenTelegramPanel,
  onOpenGeneralSettings,
  onBackToDetails
}: CinemaGateProps) => (
  <div className="hc-screen-overlay" data-tv-scope="ui">
    <div className="hc-panel hc-panel--compact p-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="hc-badge hc-badge--telegram">
            <Play size={16} />
            <span>Cinema Gate</span>
          </div>
          <h2 className="mt-4 text-4xl font-bold text-white">שער הצפייה</h2>
          <p className="hc-subtitle mt-3 text-base">
            אתה עומד להיכנס לזרימת הצפייה של <span className="text-white">{title}</span>. מכאן בוחרים אם
            להמשיך לטלגרם, לנגן או לעבור כוונון כללי לפני הכניסה לתוכן.
          </p>
        </div>
        <button onClick={onBackToDetails} className="hc-close-button p-3">
          <X size={22} />
        </button>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <button
          onClick={onOpenTelegramPanel}
          className="hc-card hc-focusable border-[#2AABEE]/25 bg-[#2AABEE]/12 px-6 py-6 text-right text-white"
        >
          <div className="text-2xl font-semibold">חיבור Telegram</div>
          <div className="mt-2 text-sm text-white/65">
            כניסה למעטפת Telegram היציבה של המערכת, עם מקורות, חיפוש כתוביות והעברה לנגן.
          </div>
        </button>

        <button
          onClick={onOpenGeneralSettings}
          className="hc-card hc-focusable px-6 py-6 text-right text-white"
        >
          <div className="flex items-center gap-3 text-2xl font-semibold">
            <Settings size={22} />
            <span>הגדרות ניגון</span>
          </div>
          <div className="mt-2 text-sm text-white/65">
            שליטה בטעינת מסדרון, הכנת הפרק הבא והגדרות כלליות לפני שממשיכים לשכבת הצפייה.
          </div>
        </button>
      </div>
    </div>
  </div>
);
