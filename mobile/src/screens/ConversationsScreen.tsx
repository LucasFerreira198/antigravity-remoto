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
} from 'react-native';
import { MessageSquare, Plus, Search, Folder, Clock, Layers, X, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
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
    // Carregar cache local de conversas imediatamente (0ms)
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
      {/* Barra de Busca Moderna */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Search size={16} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar conversas..."
            placeholderTextColor="#64748b"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <X size={15} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Filtro por Projeto com Chips Estilizados */}
      <View style={styles.projectsScroll}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: '', name: 'Todos' }, ...projects]}
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
                <Folder size={12} color={isSelected ? '#38bdf8' : '#64748b'} style={{ marginRight: 5 }} />
                <Text style={[styles.projectChipText, isSelected && styles.projectChipTextActive]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Lista de Conversas com Cards Glassmorphic */}
      {isLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>Sincronizando com o Antigravity...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              tintColor="#38bdf8"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrap}>
                <MessageSquare size={36} color="#38bdf8" />
              </View>
              <Text style={styles.emptyTitle}>Nenhuma conversa encontrada</Text>
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
                style={[styles.convoCard, isActive && styles.convoCardActive]}
                activeOpacity={0.75}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onSelectConversation(item);
                }}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.titleWrap}>
                    <Text style={styles.convoTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </View>
                  {isActive ? (
                    <View style={styles.activeBadge}>
                      <View style={styles.activeDot} />
                      <Text style={styles.activeText}>Executando</Text>
                    </View>
                  ) : null}
                </View>

                {item.preview ? (
                  <Text style={styles.convoPreview} numberOfLines={2}>
                    {item.preview}
                  </Text>
                ) : null}

                <View style={styles.cardFooter}>
                  <View style={styles.projectTag}>
                    <Folder size={11} color="#38bdf8" style={{ marginRight: 4 }} />
                    <Text style={styles.projectTagText} numberOfLines={1}>
                      {item.project_name}
                    </Text>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Layers size={11} color="#64748b" style={{ marginRight: 3 }} />
                      <Text style={styles.metaText}>{item.step_count}</Text>
                    </View>
                    <View style={[styles.metaItem, { marginLeft: 10 }]}>
                      <Clock size={11} color="#64748b" style={{ marginRight: 3 }} />
                      <Text style={styles.metaText}>{formatRelativeTime(item.last_modified_time)}</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141418',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#f8fafc',
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
    backgroundColor: '#141418',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  projectChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: '#38bdf8',
  },
  projectChipText: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '500',
  },
  projectChipTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 120,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fafafa',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#71717a',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  emptyNewBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  convoCard: {
    backgroundColor: '#121318',
    borderRadius: 14,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#22232a',
  },
  convoCardActive: {
    borderColor: 'rgba(56, 189, 248, 0.6)',
    borderLeftWidth: 3,
    borderLeftColor: '#38bdf8',
    backgroundColor: '#161922',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  titleWrap: {
    flex: 1,
  },
  convoTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#38bdf8',
    marginRight: 4,
  },
  activeText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
  },
  convoPreview: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(30, 41, 59, 0.6)',
  },
  projectTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: '55%',
  },
  projectTagText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    color: '#64748b',
    fontSize: 11,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 25,
    elevation: 8,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
