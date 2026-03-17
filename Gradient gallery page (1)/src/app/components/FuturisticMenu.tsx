import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import { Search, Star, Film, Tv, Flag, MessageCircle, Settings, LogOut, ChevronLeft } from "lucide-react";

interface SubSubCategory {
  label: string;
}

interface SubCategory {
  label: string;
  items: SubSubCategory[];
}

interface MenuItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  subCategories?: SubCategory[];
}

const genres = [
  { label: "אקשן" },
  { label: "דרמה" },
  { label: "קומדיה" },
  { label: "רומנטי" },
  { label: "מתח" },
  { label: "אימה" },
  { label: "מדע בדיוני" },
  { label: "פנטזיה" },
];

const years = [
  { label: "2024" },
  { label: "2023" },
  { label: "2022" },
  { label: "2021" },
  { label: "2020" },
  { label: "2019" },
  { label: "2018" },
  { label: "2017" },
];

const menuItems: MenuItem[] = [
  { label: "חיפוש", icon: Search },
  { label: "מועדפים", icon: Star },
  { 
    label: "סרטים", 
    icon: Film,
    subCategories: [
      { label: "ז'אנרים", items: genres },
      { label: "לפי שנים", items: years },
    ]
  },
  { 
    label: "סדרות", 
    icon: Tv,
    subCategories: [
      { label: "ז'אנרים", items: genres },
      { label: "לפי שנים", items: years },
    ]
  },
  { label: "ישראלי", icon: Flag },
  { label: "קבוצות טלגרם", icon: MessageCircle },
  { label: "הגדרות", icon: Settings },
  { label: "יציאה", icon: LogOut },
];

export function FuturisticMenu() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [expandedSubIndex, setExpandedSubIndex] = useState<number | null>(null);

  return (
    <div className="fixed top-0 right-0 h-full flex items-start justify-end pt-20 pr-8 pointer-events-none" dir="rtl">
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative pointer-events-auto"
      >
        {/* Glass morphism container */}
        <div className="bg-white/40 backdrop-blur-2xl rounded-[2.5rem] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.06)] border border-white/60">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex flex-col gap-2"
          >
            {menuItems.map((item, index) => {
              const Icon = item.icon;
              const isSelected = selectedIndex === index;
              const isHovered = hoveredIndex === index;
              const isExpanded = expandedIndex === index;

              return (
                <div key={index}>
                  <motion.button
                    onClick={() => {
                      setSelectedIndex(index);
                      if (item.subCategories) {
                        setExpandedIndex(isExpanded ? null : index);
                        setExpandedSubIndex(null);
                      }
                    }}
                    onHoverStart={() => setHoveredIndex(index)}
                    onHoverEnd={() => setHoveredIndex(null)}
                    className="relative w-64 group"
                    whileTap={{ scale: 0.98 }}
                  >
                    {/* Background glow effect */}
                    {(isSelected || isHovered) && (
                      <motion.div
                        layoutId={isSelected ? "selected" : "hovered"}
                        className={`absolute inset-0 rounded-2xl ${
                          isSelected 
                            ? "bg-gradient-to-r from-blue-500/10 to-purple-500/10" 
                            : "bg-gray-900/[0.02]"
                        }`}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}

                    {/* Selected indicator */}
                    {isSelected && (
                      <motion.div
                        layoutId="indicator"
                        className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}

                    <div className="relative flex items-center gap-5 px-8 py-5">
                      {/* Icon container */}
                      <motion.div
                        animate={{
                          scale: isSelected ? 1.1 : 1,
                          rotate: isHovered ? 5 : 0,
                        }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        className={`flex items-center justify-center w-12 h-12 rounded-2xl ${
                          isSelected
                            ? "bg-gradient-to-br from-blue-500 to-purple-500 shadow-lg shadow-blue-500/20"
                            : "bg-white/60 backdrop-blur-sm"
                        } transition-all duration-300`}
                      >
                        <Icon
                          className={`w-6 h-6 ${
                            isSelected ? "text-white" : "text-gray-700"
                          } transition-colors duration-300`}
                        />
                      </motion.div>

                      {/* Label */}
                      <motion.span
                        animate={{
                          x: isSelected ? -4 : 0,
                        }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className={`text-2xl tracking-wide ${
                          isSelected
                            ? "bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
                            : "text-gray-700"
                        } transition-all duration-300`}
                      >
                        {item.label}
                      </motion.span>

                      {/* Chevron for expandable items */}
                      {item.subCategories && (
                        <motion.div
                          animate={{ rotate: isExpanded ? -90 : 0 }}
                          transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        >
                          <ChevronLeft className="w-5 h-5 text-gray-500" />
                        </motion.div>
                      )}

                      {/* Hover shine effect */}
                      {isHovered && !isSelected && (
                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: [0, 1, 0], x: [-20, 100] }}
                          transition={{ duration: 0.8, ease: "easeInOut" }}
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none"
                          style={{ width: "50%" }}
                        />
                      )}
                    </div>
                  </motion.button>

                  {/* Sub-categories */}
                  <AnimatePresence>
                    {isExpanded && item.subCategories && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="pr-4 pt-2 space-y-2">
                          {item.subCategories.map((subCat, subIndex) => {
                            const isSubExpanded = expandedSubIndex === subIndex && isExpanded;
                            
                            return (
                              <div key={subIndex}>
                                <motion.button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedSubIndex(isSubExpanded ? null : subIndex);
                                  }}
                                  whileHover={{ x: -4 }}
                                  whileTap={{ scale: 0.98 }}
                                  className="w-full text-right px-6 py-2 rounded-xl bg-white/30 backdrop-blur-sm hover:bg-white/50 transition-all duration-200 flex items-center justify-between"
                                >
                                  <span className="text-lg text-gray-700 font-medium">{subCat.label}</span>
                                  <motion.div
                                    animate={{ rotate: isSubExpanded ? -90 : 0 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                  >
                                    <ChevronLeft className="w-4 h-4 text-gray-500" />
                                  </motion.div>
                                </motion.button>

                                {/* Sub-sub-categories (genres/years) */}
                                <AnimatePresence>
                                  {isSubExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                      className="overflow-hidden"
                                    >
                                      <div className="pr-4 pt-2 flex flex-wrap gap-2">
                                        {subCat.items.map((subSubItem, subSubIndex) => (
                                          <motion.button
                                            key={subSubIndex}
                                            whileHover={{ scale: 1.05, y: -2 }}
                                            whileTap={{ scale: 0.95 }}
                                            className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-sm hover:from-blue-500/30 hover:to-purple-500/30 transition-all duration-200 border border-white/40"
                                          >
                                            <span className="text-sm text-gray-700 font-medium">
                                              {subSubItem.label}
                                            </span>
                                          </motion.button>
                                        ))}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </motion.div>
        </div>

        {/* Ambient light effects */}
        <div className="absolute -inset-20 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5 blur-3xl -z-10 opacity-60" />
        <div className="absolute -inset-40 bg-gradient-to-br from-blue-400/3 to-purple-400/3 blur-[100px] -z-20" />
      </motion.div>
    </div>
  );
}