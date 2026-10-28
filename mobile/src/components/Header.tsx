import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Terminal, ChevronDown, FolderGit2, Zap } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { colors, isTabletDevice } from '../theme/colors';
import { api } from '../services/api';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenProjects: () => void;
  onOpenTasks?: () => void;
  onOpenConnect?: () => void;
  currentProjectName?: string;
  isConnected?: boolean;
}

export default function Header({
  onOpenSettings,
  onOpenProjects,
  onOpenTasks,
  onOpenConnect,
  currentProjectName = 'antigravity-remoto',
  isConnected = true,
}: HeaderProps) {
  const { width } = useWindowDimensions();
  const isTablet = isTabletDevice(width);
  const [runningTasksCount, setRunningTasksCount] = useState<number>(0);
  const [activeProject, setActiveProject] = useState<string>(currentProjectName);

  useEffect(() => {
    if (currentProjectName) {
      setActiveProject(currentProjectName);
    }
  }, [currentProjectName]);

  useEffect(() => {
    // Buscar tarefas ativas e projetos
    const fetchStatus = async () => {
      try {
        const convos = await api.getConversations(5);
        if (convos && convos.length > 0) {
          const tasks = await api.getBackgroundTasks(convos[0].id).catch(() => []);
          const running = (tasks || []).filter((t: any) => t.status === 'running').length;
          setRunningTasksCount(running);
        }
      } catch (e) {
        // Ignorar falhas silenciosas de polling
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.outerContainer}>
      <View style={[styles.header, isTablet && styles.headerTablet]}>
        {/* Lado Esquerdo: Marca + Projeto Ativo */}
        <View style={styles.brandGroup}>
          <View style={styles.logoBadge}>
            <Zap size={16} color="#ffffff" />
          </View>

          <View style={styles.brandTextGroup}>
            <View style={styles.titleRow}>
              <Text style={styles.brandTitle}>Antigravity</Text>
              <View style={styles.remoteBadge}>
                <Text style={styles.remoteBadgeText}>REMOTE</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.projectSelectorBtn}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onOpenProjects();
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <FolderGit2 size={12} color={colors.accentCyan} style={{ marginRight: 4 }} />
              <Text style={styles.projectNameText} numberOfLines={1}>
                {activeProject}
              </Text>
              <ChevronDown size={12} color={colors.textSecondary} style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Lado Direito: Tarefas em Segundo Plano + Pílula de Conexão */}
        <View style={styles.actionsGroup}>
          {onOpenTasks && (
            <TouchableOpacity
              style={styles.tasksBtn}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onOpenTasks();
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Terminal size={14} color={colors.accentCyan} />
              <Text style={styles.tasksCountText}>{runningTasksCount}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.connectionPill,
              isConnected ? styles.connectionPillOnline : styles.connectionPillOffline,
            ]}
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (onOpenConnect) onOpenConnect();
              else onOpenSettings();
            }}
          >
            <View
              style={[
                styles.statusDot,
                isConnected ? styles.statusDotOnline : styles.statusDotOffline,
              ]}
            />
            <Text
              style={[
                styles.connectionText,
                isConnected ? styles.connectionTextOnline : styles.connectionTextOffline,
              ]}
            >
              {isConnected ? 'Online' : 'Offline'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    backgroundColor: colors.backgroundElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
  },
  headerTablet: {
    maxWidth: 1080,
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.primaryViolet,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4,
  },
  brandTextGroup: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  remoteBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    marginLeft: 6,
  },
  remoteBadgeText: {
    color: '#C4B5FD',
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  projectSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  projectNameText: {
    color: colors.textSecondary,
    fontSize: 11,
    maxWidth: 160,
  },
  actionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tasksBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundModal,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginRight: 8,
  },
  tasksCountText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginLeft: 5,
  },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  connectionPillOnline: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  connectionPillOffline: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.35)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusDotOnline: {
    backgroundColor: colors.statusEmerald,
  },
  statusDotOffline: {
    backgroundColor: colors.statusRose,
  },
  connectionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  connectionTextOnline: {
    color: '#6EE7B7',
  },
  connectionTextOffline: {
    color: '#FDA4AF',
  },
});
