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
  <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/92 p-8" data-tv-scope="ui">
    <div className="w-full max-w-3xl rounded-[40px] border border-[#2AABEE]/25 bg-[linear-gradient(180deg,rgba(12,18,24,0.98),rgba(5,8,12,0.95))] p-8 shadow-[0_0_60px_rgba(0,0,0,0.55)]">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-3 rounded-full border border-[#2AABEE]/20 bg-[#2AABEE]/10 px-4 py-2 text-sm text-[#89d0ff]">
            <Play size={16} />
            <span>Cinema Gate</span>
          </div>
          <h2 className="mt-4 text-4xl font-bold text-white">שער הצפייה</h2>
          <p className="mt-3 text-base leading-7 text-white/60">
            אתה עומד להכנס לזרימת הצפייה של <span className="text-white">{title}</span>. בשלב הייצוב אנחנו מחזיקים כאן כניסה מסודרת ונקייה לשכבות Telegram והנגן.
          </p>
        </div>
        <button onClick={onBackToDetails} className="rounded-full border border-white/10 bg-white/5 p-3 text-white/70 transition hover:bg-white/10 hover:text-white">
          <X size={22} />
        </button>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <button
          onClick={onOpenTelegramPanel}
          className="rounded-[28px] border border-[#2AABEE]/25 bg-[#2AABEE]/12 px-6 py-6 text-right text-white transition hover:bg-[#2AABEE]/18"
        >
          <div className="text-2xl font-semibold">חיבור Telegram</div>
          <div className="mt-2 text-sm text-white/65">כניסה למעטפת Telegram היציבה של המערכת.</div>
        </button>

        <button
          onClick={onOpenGeneralSettings}
          className="rounded-[28px] border border-white/10 bg-white/[0.04] px-6 py-6 text-right text-white transition hover:bg-white/8"
        >
          <div className="flex items-center gap-3 text-2xl font-semibold">
            <Settings size={22} />
            <span>הגדרות ניגון</span>
          </div>
          <div className="mt-2 text-sm text-white/65">שליטה בגודל הטעינה ובהכנת פרק הבא לפני שנמשיך לעומק הנגן.</div>
        </button>
      </div>
    </div>
  </div>
);
