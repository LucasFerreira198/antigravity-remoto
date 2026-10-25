import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Layers, FolderGit2, Sliders, Plus, Wifi, MessageSquare } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { colors, isTabletDevice } from '../theme/colors';

export type TabKey = 'conversations' | 'projects' | 'connect' | 'settings' | 'chat';

interface BottomNavBarProps {
  currentTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onNewConversation: () => void;
  hasActiveChat?: boolean;
}

export default function BottomNavBar({
  currentTab,
  onTabChange,
  onNewConversation,
  hasActiveChat = false,
}: BottomNavBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = isTabletDevice(width);
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8);

  const handleTabPress = (tab: TabKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTabChange(tab);
  };

  const handleNewPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onNewConversation();
  };

  return (
    <View style={[styles.outerContainer, { paddingBottom: bottomPadding }]}>
      <View style={[styles.innerContainer, isTablet && styles.innerContainerTablet]}>
        {/* Tab 1: Sessões / Conversas */}
        <TouchableOpacity
          style={styles.tabBtn}
          activeOpacity={0.7}
          onPress={() => handleTabPress('conversations')}
        >
          <View style={styles.iconWrap}>
            <Layers
              size={20}
              color={currentTab === 'conversations' ? colors.primaryViolet : colors.textSecondary}
            />
            {currentTab === 'conversations' && <View style={styles.activeDot} />}
          </View>
          <Text
            style={[
              styles.tabLabel,
              currentTab === 'conversations' && styles.tabLabelActive,
            ]}
          >
            Sessões
          </Text>
        </TouchableOpacity>

        {/* Tab 2: Projetos */}
        <TouchableOpacity
          style={styles.tabBtn}
          activeOpacity={0.7}
          onPress={() => handleTabPress('projects')}
        >
          <View style={styles.iconWrap}>
            <FolderGit2
              size={20}
              color={currentTab === 'projects' ? colors.primaryViolet : colors.textSecondary}
            />
            {currentTab === 'projects' && <View style={styles.activeDot} />}
          </View>
          <Text
            style={[
              styles.tabLabel,
              currentTab === 'projects' && styles.tabLabelActive,
            ]}
          >
            Projetos
          </Text>
        </TouchableOpacity>

        {/* Botão Central: + Nova Conversa */}
        <TouchableOpacity
          style={styles.centerActionBtn}
          activeOpacity={0.85}
          onPress={handleNewPress}
        >
          <View style={styles.centerActionInner}>
            <Plus size={18} color="#ffffff" strokeWidth={2.8} />
            <Text style={styles.centerActionText}>Novo</Text>
          </View>
        </TouchableOpacity>

        {/* Tab 3: Conexão / Túnel */}
        <TouchableOpacity
          style={styles.tabBtn}
          activeOpacity={0.7}
          onPress={() => handleTabPress('connect')}
        >
          <View style={styles.iconWrap}>
            <Wifi
              size={20}
              color={currentTab === 'connect' ? colors.primaryViolet : colors.textSecondary}
            />
            {currentTab === 'connect' && <View style={styles.activeDot} />}
          </View>
          <Text
            style={[
              styles.tabLabel,
              currentTab === 'connect' && styles.tabLabelActive,
            ]}
          >
            Ligação
          </Text>
        </TouchableOpacity>

        {/* Tab 4: Ajustes / Configurações */}
        <TouchableOpacity
          style={styles.tabBtn}
          activeOpacity={0.7}
          onPress={() => handleTabPress('settings')}
        >
          <View style={styles.iconWrap}>
            <Sliders
              size={20}
              color={currentTab === 'settings' ? colors.primaryViolet : colors.textSecondary}
            />
            {currentTab === 'settings' && <View style={styles.activeDot} />}
          </View>
          <Text
            style={[
              styles.tabLabel,
              currentTab === 'settings' && styles.tabLabelActive,
            ]}
          >
            Ajustes
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    backgroundColor: colors.backgroundElevated,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    width: '100%',
  },
  innerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 8,
    paddingHorizontal: 12,
    width: '100%',
  },
  innerContainerTablet: {
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    minHeight: 48,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 24,
  },
  activeDot: {
    position: 'absolute',
    bottom: -3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primaryViolet,
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
  },
  tabLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 3,
  },
  tabLabelActive: {
    color: colors.primaryViolet,
    fontWeight: '700',
  },
  centerActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    minWidth: 54,
  },
  centerActionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryViolet,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  centerActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
});
