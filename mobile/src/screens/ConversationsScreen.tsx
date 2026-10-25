import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { Plus, Search, FolderGit2, Clock, Layers, X, Code2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { colors, isTabletDevice } from '../theme/colors';
import { api } from '../services/api';
import { StorageService } from '../services/storage';
import { Conversation, Project } from '../types';

interface ConversationsScreenProps {
  onSelectConversation: (convo: Conversation) => void;
  onOpenNewConversation: () => void;
  onOpenSettings: () => void;
  onOpenProjects: () => void;
}

export default function ConversationsScreen({
  onSelectConversation,
  onOpenNewConversation,
  onOpenSettings,
  onOpenProjects,
}: ConversationsScreenProps) {
  const { width } = useWindowDimensions();
  const isTablet = isTabletDevice(width);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async (refresh: boolean = false) => {
    if (refresh) setIsRefreshing(true);

    try {
      const [convosData, projectsData] = await Promise.all([
        api.getConversations(60),
        api.getProjects(),
      ]);
      setConversations(convosData);
      setProjects(projectsData);
      StorageService.saveConversationsCache(convosData);
    } catch (e) {
      console.warn('Erro ao carregar conversas:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    StorageService.getConversationsCache().then((cached) => {
      if (cached && cached.length > 0) {
        setConversations(cached);
        setIsLoading(false);
      }
    });

    loadData(false);
  }, []);

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const matchesProject = !selectedProjectId || c.project_id === selectedProjectId;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery = !q || c.title.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q);
      return matchesProject && matchesQuery;
    });
  }, [conversations, selectedProjectId, searchQuery]);

  const formatRelativeTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}m atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays === 1) return 'Ontem';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.mainWrapper, isTablet && styles.mainWrapperTablet]}>
        {/* Barra de Busca Obsidian */}
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Search size={16} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Pesquisar conversas ou artefactos..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                <X size={15} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Filtro por Projeto */}
        <View style={styles.projectsScroll}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[{ id: '', name: 'Todos os Repositórios' }, ...projects]}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16 }}
            renderItem={({ item }) => {
              const isSelected = (!selectedProjectId && item.id === '') || selectedProjectId === item.id;
              return (
                <TouchableOpacity
                  style={[styles.projectChip, isSelected && styles.projectChipActive]}
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedProjectId(item.id === '' ? null : item.id);
                  }}
                >
                  <FolderGit2
                    size={12}
                    color={isSelected ? colors.accentCyan : colors.textSecondary}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.projectChipText, isSelected && styles.projectChipTextActive]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Lista de Sessões (1 coluna em Smartphone, 2 colunas em Tablet) */}
        {isLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={colors.primaryViolet} />
            <Text style={styles.loadingText}>Sincronizando com o Antigravity Remoto...</Text>
          </View>
        ) : (
          <FlatList
            key={isTablet ? 'tablet-grid' : 'mobile-list'}
            data={filteredConversations}
            numColumns={isTablet ? 2 : 1}
            keyExtractor={(item) => item.id}
            columnWrapperStyle={isTablet ? styles.tabletRow : undefined}
            contentContainerStyle={[styles.listContent, { paddingBottom: 110 }]}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadData(true)}
                tintColor={colors.primaryViolet}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconWrap}>
                  <Layers size={36} color={colors.primaryViolet} />
                </View>
                <Text style={styles.emptyTitle}>Nenhuma sessão encontrada</Text>
                <Text style={styles.emptyDesc}>
                  {searchQuery
                    ? 'Nenhum resultado corresponde à sua pesquisa.'
                    : 'Inicie uma nova tarefa no seu PC tocando no botão "+ Nova Conversa" abaixo.'}
                </Text>
                {!searchQuery && (
                  <TouchableOpacity
                    style={styles.emptyNewBtn}
                    onPress={onOpenNewConversation}
                    activeOpacity={0.8}
                  >
                    <Plus size={16} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.emptyNewBtnText}>Nova Conversa</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
            renderItem={({ item }) => {
              const isActive = !!item.is_active;
              return (
                <TouchableOpacity
                  style={[
                    styles.convoCard,
                    isTablet && styles.convoCardTablet,
                    isActive && styles.convoCardActive,
                  ]}
                  activeOpacity={0.75}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onSelectConversation(item);
                  }}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.titleWrap}>
                      {isActive && <View style={styles.unreadDot} />}
                      <Text style={styles.convoTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                    </View>
                    {isActive ? (
                      <View style={styles.activeBadge}>
                        <View style={styles.activeDot} />
                        <Text style={styles.activeText}>Executando</Text>
                      </View>
                    ) : (
                      <Text style={styles.timeText}>{formatRelativeTime(item.last_modified_time)}</Text>
                    )}
                  </View>

                  {item.preview ? (
                    <Text style={styles.convoPreview} numberOfLines={2}>
                      {item.preview}
                    </Text>
                  ) : null}

                  <View style={styles.cardFooter}>
                    <View style={styles.projectTag}>
                      <FolderGit2 size={11} color={colors.accentCyan} style={{ marginRight: 4 }} />
                      <Text style={styles.projectTagText} numberOfLines={1}>
                        {item.project_name || 'workspace'}
                      </Text>
                    </View>

                    <View style={styles.metaRow}>
                      <View style={styles.modelPill}>
                        <Text style={styles.modelPillText}>Gemini 3.8 Flash</Text>
                      </View>

                      {item.step_count > 0 && (
                        <View style={styles.artifactsPill}>
                          <Code2 size={11} color={colors.accentCyan} style={{ marginRight: 3 }} />
                          <Text style={styles.artifactsPillText}>{item.step_count}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* FAB Flutuante "+ Nova Conversa" */}
        <TouchableOpacity
          style={styles.fabBtn}
          activeOpacity={0.85}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onOpenNewConversation();
          }}
        >
          <Plus size={18} color="#ffffff" strokeWidth={2.8} />
          <Text style={styles.fabBtnText}>Nova Conversa</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
  },
  mainWrapper: {
    flex: 1,
    width: '100%',
  },
  mainWrapperTablet: {
    maxWidth: 1080,
    alignSelf: 'center',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
  },
  clearBtn: {
    padding: 4,
  },
  projectsScroll: {
    marginBottom: 8,
  },
  projectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  projectChipActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: colors.primaryViolet,
  },
  projectChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  projectChipTextActive: {
    color: '#C4B5FD',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
  },
  tabletRow: {
    justifyContent: 'space-between',
    gap: 12,
  },
  convoCard: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: 16,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  convoCardTablet: {
    flex: 1,
    marginBottom: 12,
  },
  convoCardActive: {
    borderColor: colors.primaryViolet,
    backgroundColor: '#161828',
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.accentCyan,
    marginRight: 7,
  },
  convoTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    flex: 1,
  },
  timeText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.statusEmerald,
    marginRight: 5,
  },
  activeText: {
    color: '#6EE7B7',
    fontSize: 10,
    fontWeight: '700',
  },
  convoPreview: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(35, 39, 56, 0.8)',
    paddingTop: 10,
  },
  projectTag: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  projectTagText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modelPill: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    marginRight: 6,
  },
  modelPillText: {
    color: '#C4B5FD',
    fontSize: 10,
    fontWeight: '600',
  },
  artifactsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
  },
  artifactsPillText: {
    color: colors.accentCyan,
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.25)',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    maxWidth: 280,
  },
  emptyNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryViolet,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyNewBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  fabBtn: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryViolet,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 30,
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  fabBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
});
