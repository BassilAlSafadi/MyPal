import { useTheme } from '@/components/ThemeProvider';

interface LogoIconProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
}

export const LogoIcon = ({ size = 40, className = '', showWordmark = true }: LogoIconProps) => {
  const { resolvedTheme } = useTheme();
  const fillColor = resolvedTheme === 'dark' ? '#FFFFFF' : '#1e3a8a';

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
        {/* Rounded square background */}
        <rect
          x="2"
          y="2"
          width="44"
          height="44"
          rx="10"
          fill={fillColor}
          fillOpacity="0.1"
          stroke={fillColor}
          strokeWidth="2"
        />
        {/* Globe/orb icon representing global inventory */}
        <circle
          cx="24"
          cy="24"
          r="12"
          stroke={fillColor}
          strokeWidth="2"
          fill="none"
        />
        {/* Horizontal line through globe */}
        <ellipse
          cx="24"
          cy="24"
          rx="12"
          ry="5"
          stroke={fillColor}
          strokeWidth="1.5"
          fill="none"
        />
        {/* Vertical arc on globe */}
        <path
          d="M24 12C28 12 31 17.5 31 24C31 30.5 28 36 24 36C20 36 17 30.5 17 24C17 17.5 20 12 24 12Z"
          stroke={fillColor}
          strokeWidth="1.5"
          fill="none"
        />
        {/* Small sparkle/AI indicator */}
        <circle cx="35" cy="13" r="3" fill={fillColor} />
        <path
          d="M35 9V11M35 15V17M31 13H33M37 13H39"
          stroke={fillColor}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      
      {showWordmark && (
        <span
          className="text-lg font-bold tracking-tight"
          style={{ color: fillColor }}
        >
          MyPal
        </span>
      )}
    </div>
  );
};

export default LogoIcon;
