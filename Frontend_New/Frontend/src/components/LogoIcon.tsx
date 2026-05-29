import { useTheme } from '@/components/ThemeProvider';
import logoLight from '@/assets/mypal-logo-transparent.png';
import logoWhite from '@/assets/mypal-logo-white.png';

interface LogoIconProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
}

export const LogoIcon = ({ size = 40, className = '', showWordmark = true }: LogoIconProps) => {
  const { resolvedTheme } = useTheme();
  const logoSrc = resolvedTheme === 'dark' ? logoWhite : logoLight;

  return (
    <div className={`flex items-center ${className}`}>
      <img
        src={logoSrc}
        alt="MyPal logo"
        className="block flex-shrink-0"
        style={{ width: size, height: 'auto' }}
      />
    </div>
  );
};

export default LogoIcon;
