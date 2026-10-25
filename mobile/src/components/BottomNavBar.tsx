import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageSquare, Folder, Sliders, Plus, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../theme/colors';

export type TabKey = 'conversations' | 'projects' | 'settings';

interface BottomNavBarProps {
  currentTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onNewConversation: () => void;
}

export default function BottomNavBar({
  currentTab,
  onTabChange,
  onNewConversation,
}: BottomNavBarProps) {
  const insets = useSafeAreaInsets();
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
    <View style={[styles.container, { paddingBottom: bottomPadding }]}>
      {/* Tab Conversas */}
      <TouchableOpacity
        style={styles.tabBtn}
        activeOpacity={0.7}
        onPress={() => handleTabPress('conversations')}
      >
        <View style={styles.iconWrap}>
          <MessageSquare
            size={20}
            color={currentTab === 'conversations' ? theme.colors.primary : theme.colors.textDim}
          />
          {currentTab === 'conversations' && <View style={styles.activeDot} />}
        </View>
        <Text
          style={[
            styles.tabLabel,
            currentTab === 'conversations' && styles.tabLabelActive,
          ]}
        >
          Conversas
        </Text>
      </TouchableOpacity>

      {/* Tab Projetos */}
      <TouchableOpacity
        style={styles.tabBtn}
        activeOpacity={0.7}
        onPress={() => handleTabPress('projects')}
      >
        <View style={styles.iconWrap}>
          <Folder
            size={20}
            color={currentTab === 'projects' ? theme.colors.primary : theme.colors.textDim}
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
        activeOpacity={0.8}
        onPress={handleNewPress}
      >
        <View style={styles.centerActionInner}>
          <Plus size={18} color="#ffffff" strokeWidth={2.5} />
          <Text style={styles.centerActionText}>Novo</Text>
        </View>
      </TouchableOpacity>

      {/* Tab Ajustes */}
      <TouchableOpacity
        style={styles.tabBtn}
        activeOpacity={0.7}
        onPress={() => handleTabPress('settings')}
      >
        <View style={styles.iconWrap}>
          <Sliders
            size={20}
            color={currentTab === 'settings' ? theme.colors.primary : theme.colors.textDim}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#09090b',
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    paddingTop: 8,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    minHeight: 48,
    borderRadius: 12,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
    position: 'relative',
  },
  activeDot: {
    position: 'absolute',
    bottom: -3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#38bdf8',
  },
  tabLabel: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 3,
  },
  tabLabelActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  centerActionBtn: {
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerActionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 9,
    minHeight: 42,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
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
