import React from 'react';
import Svg, { Path } from 'react-native-svg';

type IconProps = {
  size?: number;
  color?: string;
  style?: any;
};

export const FooterNavigateIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF', style }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
    <Path
      d="M12 2a7 7 0 00-7 7c0 4.418 7 13 7 13s7-8.582 7-13a7 7 0 00-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"
      fill={color}
    />
  </Svg>
);

export const FooterSaveInactiveIcon: React.FC<IconProps> = ({ size = 20, color = '#374151', style }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
    <Path
      d="M12.001 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42
         4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81
         14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4
         6.86-8.55 11.54l-1.449 1.31z"
      fill="none"
      stroke={color}
      strokeWidth={2}
    />
  </Svg>
);

export const FooterSaveActiveIcon: React.FC<IconProps> = ({ size = 20, color = '#B91C1C', style }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
    <Path
      d="M12.001 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42
         4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81
         14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4
         6.86-8.55 11.54l-1.449 1.31z"
      fill={color}
    />
  </Svg>
);

export const FooterShareIcon: React.FC<IconProps> = ({ size = 20, color = '#3A2268', style }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
    <Path
      d="M12 5m-2 0a2 2 0 1 1 4 0a2 2 0 1 1-4 0zM8 19m-2 0a2 2 0 1 1 4 0a2 2 0 1 1-4 0zM16 19m-2 0a2 2 0 1 1 4 0a2 2 0 1 1-4 0zM12 7L9 17M12 7L15 17"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

