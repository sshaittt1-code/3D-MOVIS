import { AnimatePresence, motion } from 'framer-motion';
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
        data-tv-scope="ui"
        className="hc-panel absolute left-1/2 top-1/2 z-40 ml-14 -mt-32 w-80 p-5 text-right"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-[#7debd6]">Poster Action</p>
            <p className="mt-2 truncate text-xl font-bold text-white">{item.title}</p>
          </div>
          <button onClick={onClose} className="hc-close-button p-2">
            <X size={16} />
          </button>
        </div>
        <button
          autoFocus
          onClick={onToggleFavorite}
          className={`hc-button w-full justify-between px-4 py-4 text-base ${isFavorite ? 'hc-button--danger' : 'hc-button--accent'}`}
        >
          <span>{isFavorite ? 'הסר מהמועדפים' : 'הוסף למועדפים'}</span>
          {isFavorite ? <HeartOff size={18} /> : <Heart size={18} />}
        </button>
      </motion.div>
    )}
  </AnimatePresence>
);
