import { motion, AnimatePresence } from 'framer-motion';
import { Heart, HeartOff, X } from 'lucide-react';

type PosterContextMenuProps = {
  item: any | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
};

export const PosterContextMenu = ({ item, isFavorite, onToggleFavorite, onClose }: PosterContextMenuProps) => (
  <AnimatePresence>
    {item && (
      <motion.div
        initial={{ opacity: 0, scale: 0.96, x: 12 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.96, x: 12 }}
        className="absolute left-1/2 top-1/2 z-40 ml-14 -mt-32 w-80 rounded-[28px] border border-[#00ffcc]/25 bg-[linear-gradient(180deg,rgba(5,12,16,0.92),rgba(5,8,12,0.78))] p-5 text-right shadow-[0_0_40px_rgba(0,255,204,0.14)] backdrop-blur-xl"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-[#7debd6]">Poster Action</p>
            <p className="mt-2 truncate text-xl font-bold text-white">{item.title}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
        <button
          autoFocus
          onClick={onToggleFavorite}
          className={`flex w-full items-center justify-between rounded-[20px] border px-4 py-4 text-base font-semibold transition ${
            isFavorite
              ? 'border-pink-400/35 bg-pink-500/15 text-pink-100 hover:bg-pink-500/25'
              : 'border-[#00ffcc]/20 bg-white/5 text-white hover:bg-white/10'
          }`}
        >
          <span>{isFavorite ? 'Remove from favorites' : 'Add to favorites'}</span>
          {isFavorite ? <HeartOff size={18} /> : <Heart size={18} />}
        </button>
      </motion.div>
    )}
  </AnimatePresence>
);
