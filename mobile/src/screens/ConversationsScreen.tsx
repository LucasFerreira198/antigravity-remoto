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
import { MessageSquare, Plus, Search, Folder, Clock, Layers, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { api } from '../services/api';
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
    else setIsLoading(true);

    try {
      const [convosData, projectsData] = await Promise.all([
        api.getConversations(60),
        api.getProjects(),
      ]);
      setConversations(convosData);
      setProjects(projectsData);
    } catch (e) {
      console.error('Erro ao carregar conversas:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
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
    if (diffMins < 60) return `${diffMins} min atrás`;
    if (diffHours < 24) return `${diffHours} h atrás`;
    if (diffDays === 1) return 'Ontem';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <View style={styles.container}>
      {/* Barra de Busca */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Search size={18} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar conversas..."
            placeholderTextColor="#64748b"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Filtro por Projeto */}
      <View style={styles.projectsScroll}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: '', name: 'Todos os Projetos' }, ...projects]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          renderItem={({ item }) => {
            const isSelected = (!selectedProjectId && item.id === '') || selectedProjectId === item.id;
            return (
              <TouchableOpacity
                style={[styles.projectChip, isSelected && styles.projectChipActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedProjectId(item.id === '' ? null : item.id);
                }}
              >
                <Folder size={13} color={isSelected ? '#ffffff' : '#94a3b8'} style={{ marginRight: 6 }} />
                <Text style={[styles.projectChipText, isSelected && styles.projectChipTextActive]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Lista de Conversas */}
      {isLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>Carregando conversas do Antigravity...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              tintColor="#38bdf8"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MessageSquare size={48} color="#334155" />
              <Text style={styles.emptyTitle}>Nenhuma conversa encontrada</Text>
              <Text style={styles.emptyDesc}>
                {searchQuery
                  ? 'Tente outro termo de busca'
                  : 'Toque no botão + abaixo para iniciar uma nova conversa com o Antigravity.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.convoCard}
              activeOpacity={0.7}
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
                {item.is_active && (
                  <View style={styles.activeBadge}>
                    <View style={styles.activeDot} />
                    <Text style={styles.activeText}>Ativo</Text>
                  </View>
                )}
              </View>

              {item.preview ? (
                <Text style={styles.convoPreview} numberOfLines={2}>
                  {item.preview}
                </Text>
              ) : null}

              <View style={styles.cardFooter}>
                <View style={styles.projectTag}>
                  <Folder size={12} color="#38bdf8" style={{ marginRight: 4 }} />
                  <Text style={styles.projectTagText} numberOfLines={1}>
                    {item.project_name}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Layers size={12} color="#64748b" style={{ marginRight: 4 }} />
                    <Text style={styles.metaText}>{item.step_count} passos</Text>
                  </View>
                  <View style={[styles.metaItem, { marginLeft: 12 }]}>
                    <Clock size={12} color="#64748b" style={{ marginRight: 4 }} />
                    <Text style={styles.metaText}>{formatRelativeTime(item.last_modified_time)}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Botão Flutuante (Criar Nova Conversa) */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          onOpenNewConversation();
        }}
      >
        <Plus size={24} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131d2e',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14,
  },
  projectsScroll: {
    maxHeight: 46,
    marginBottom: 8,
  },
  projectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131d2e',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  projectChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  projectChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  projectChipTextActive: {
    color: '#ffffff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptyDesc: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  convoCard: {
    backgroundColor: '#131d2e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  titleWrap: {
    flex: 1,
    marginRight: 8,
  },
  convoTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34d399',
    marginRight: 5,
  },
  activeText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '700',
  },
  convoPreview: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
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
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    maxWidth: '45%',
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
    right: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
});
