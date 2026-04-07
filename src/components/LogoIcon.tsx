import { useTheme } from '@/components/ThemeProvider';

interface LogoIconProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
}

export const LogoIcon = ({ size = 40, className = '', showWordmark = true }: LogoIconProps) => {
  const { resolvedTheme } = useTheme();
  const color = resolvedTheme === 'dark' ? '#FFFFFF' : '#1e3a8a';
  const accent = resolvedTheme === 'dark' ? '#FFFFFF' : '#2563eb';

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <rect
          x="2"
          y="2"
          width="44"
          height="44"
          rx="12"
          fill={accent}
          fillOpacity="0.1"
          stroke={accent}
          strokeWidth="2"
        />
        <path
          d="M12 32C18 22 28 20 36 14"
          stroke={accent}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M14 30C18 26 26 24 34 16"
          stroke={accent}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M14 30L20 20C22 16 28 14 32 18L34 22"
          stroke={accent}
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="34" cy="12" r="3.5" fill={accent} />
        <path
          d="M34 8.5L35.5 11.7L39.2 12.5L35.5 13.3L34 16.5L32.5 13.3L28.8 12.5L32.5 11.7L34 8.5Z"
          fill={resolvedTheme === 'dark' ? '#1e3a8a' : '#FFFFFF'}
        />
      </svg>

      {showWordmark && (
        <span className="text-lg font-bold tracking-tight" style={{ color }}>
          MyPal
        </span>
      )}
    </div>
  );
};

export default LogoIcon;
