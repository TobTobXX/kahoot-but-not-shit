// Shared icon used to represent answer slots on both the host and player screens.
// The four shapes (circle, diamond, triangle, square) map 1:1 to the four slot positions.
export default function SlotIcon({ name, className }) {
  const size = 40
  const fill = 'currentColor'
  if (name === 'circle') {
    return <svg width={size} height={size} viewBox="0 0 40 40" className={className}><circle cx="20" cy="20" r="18" fill={fill} /></svg>
  }
  if (name === 'diamond') {
    return <svg width={size} height={size} viewBox="0 0 40 40" className={className}><rect x="6" y="6" width="20" height="20" transform="rotate(45 20 20)" fill={fill} /></svg>
  }
  if (name === 'triangle') {
    return <svg width={size} height={size} viewBox="0 0 40 40" className={className}><polygon points="20,4 38,36 2,36" fill={fill} /></svg>
  }
  if (name === 'square') {
    return <svg width={size} height={size} viewBox="0 0 40 40" className={className}><rect width="36" height="36" x="2" y="2" rx="2" fill={fill} /></svg>
  }
  return null
}
