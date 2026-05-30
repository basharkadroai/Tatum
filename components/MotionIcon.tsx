'use client';
import { motion } from 'motion/react';
import type { ComponentType, CSSProperties } from 'react';

type IconCmp = ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
type Mode = 'scale' | 'rotate' | 'bob' | 'loop';

const HOVERS: Record<Exclude<Mode, 'loop'>, Record<string, number>> = {
  scale: { scale: 1.18 },
  rotate: { rotate: 14, scale: 1.08 },
  bob: { y: -2, scale: 1.1 },
};

// Animated wrapper for any Lucide icon: spring on hover/tap, or a gentle loop.
export function MotionIcon({
  icon: Icon, size = 18, strokeWidth = 1.8, color, mode = 'scale', style,
}: {
  icon: IconCmp; size?: number; strokeWidth?: number; color?: string; mode?: Mode; style?: CSSProperties;
}) {
  if (mode === 'loop') {
    return (
      <motion.span
        style={{ display: 'inline-flex', ...style }}
        animate={{ scale: [1, 1.14, 1], rotate: [0, 12, 0] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Icon size={size} strokeWidth={strokeWidth} color={color} />
      </motion.span>
    );
  }
  return (
    <motion.span
      style={{ display: 'inline-flex', ...style }}
      whileHover={HOVERS[mode]}
      whileTap={{ scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 400, damping: 14 }}
    >
      <Icon size={size} strokeWidth={strokeWidth} color={color} />
    </motion.span>
  );
}
