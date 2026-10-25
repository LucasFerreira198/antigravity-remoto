import { StyleSheet, Dimensions } from 'react-native';

export const colors = {
  // Cores do Design System Cyber-Developer Obsidian
  backgroundPrimary: '#090A0F',  // Fundo Principal (Obsidian Space)
  backgroundElevated: '#12141F', // Superfície Elevada / Cartões
  backgroundSurface: '#171A28',  // Superfície Interativa / Botões Sutis
  backgroundModal: '#181B29',    // Fundo de Modais / BottomSheets
  primaryViolet: '#8B5CF6',      // Acento Principal (Antigravity Violet)
  accentCyan: '#06B6D4',         // Acento Secundário (Cyber Cyan)
  statusEmerald: '#10B981',      // Estado Online / WebSocket Ativo
  statusAmber: '#F59E0B',        // Estado em Execução / Aviso
  statusRose: '#F43F5E',         // Erro / Desligado
  textPrimary: '#F8FAFC',        // Texto Principal
  textSecondary: '#94A3B8',      // Texto Secundário / Metadados
  textMuted: '#64748B',          // Texto Mais Apagado
  borderSubtle: '#232738',       // Bordas e Divisores
} as const;

export const theme = {
  colors: {
    background: colors.backgroundPrimary,
    backgroundSubtle: colors.backgroundElevated,
    card: colors.backgroundElevated,
    cardHover: '#171A28',
    popover: colors.backgroundModal,
    border: colors.borderSubtle,
    borderSubtle: colors.borderSubtle,
    borderFocus: colors.primaryViolet,
    text: colors.textPrimary,
    textMuted: colors.textSecondary,
    textDim: '#64748B',
    primary: colors.primaryViolet,
    primaryDark: '#7C3AED',
    primaryGlow: 'rgba(139, 92, 246, 0.2)',
    cyan: colors.accentCyan,
    cyanGlow: 'rgba(6, 182, 212, 0.2)',
    success: colors.statusEmerald,
    successGlow: 'rgba(16, 185, 129, 0.15)',
    warning: colors.statusAmber,
    warningGlow: 'rgba(245, 158, 11, 0.15)',
    destructive: colors.statusRose,
    destructiveGlow: 'rgba(244, 63, 94, 0.15)',
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    full: 9999,
  },
};

export const TABLET_BREAKPOINT = 768;
export const isTabletDevice = (width?: number) => {
  const w = width ?? Dimensions.get('window').width;
  return w >= TABLET_BREAKPOINT;
};
