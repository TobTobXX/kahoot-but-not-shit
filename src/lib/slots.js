// Slot color definitions used on both the host screen (inline style) and the
// player screen (Tailwind classes). Keeping them in one place ensures the two
// screens always show the same colors.

// Tailwind bg-* classes — used by Play.jsx for slot buttons and feedback grid.
export const SLOT_COLOR_CLASSES = {
  red:    'bg-red-500',
  blue:   'bg-blue-500',
  yellow: 'bg-amber-400',
  green:  'bg-emerald-500',
}

// Hex values — used by Host.jsx which sets backgroundColor via inline style
// because Tailwind's JIT won't generate classes for dynamically-chosen colors.
export const SLOT_COLOR_HEX = {
  red:    '#FF4949',
  blue:   '#2D7DD2',
  yellow: '#FFD60A',
  green:  '#2ECC71',
}
