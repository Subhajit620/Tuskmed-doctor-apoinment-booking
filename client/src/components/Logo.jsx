/** Shared brand mark - a rounded badge with a pulse line, used in the header and on login. */
export default function Logo({ size = 32, tone = 'brand' }) {
  const bg = tone === 'inverted' ? 'rgba(255,255,255,0.16)' : '#1E9E92';
  const stroke = tone === 'inverted' ? '#F0FBF9' : '#ffffff';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill={bg} />
      <path
        d="M6 17h4l2.2-6 3.4 11 2.6-8.5L20 17h6"
        stroke={stroke}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
