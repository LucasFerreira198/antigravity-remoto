import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  BackHandler,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Sparkles, Search, Check, Globe, Flame, Bot, Compass, ArrowRight, Wrench, Shield, Code2, Cloud, Palette, Share2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { api } from '../services/api';
import { Skill } from '../types';

interface SkillsCatalogModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectSkill: (prompt: string) => void;
}

export default function SkillsCatalogModal({
  visible,
  onClose,
  onSelectSkill,
}: SkillsCatalogModalProps) {
  const insets = useSafeAreaInsets();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');

  useEffect(() => {
    if (visible) {
      loadSkills();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onBack = () => {
      onClose();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [visible, onClose]);

  const loadSkills = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSkills();
      setSkills(data);
    } catch (e) {
      console.error('Erro ao carregar skills:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    skills.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return ['Todas', ...Array.from(set)];
  }, [skills]);

  const filteredSkills = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return skills.filter((s) => {
      const matchesCategory = selectedCategory === 'Todas' || s.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.folder_name.toLowerCase().includes(q)
      );
    });
  }, [skills, selectedCategory, searchQuery]);

  const getCategoryIcon = (cat: string) => {
    const c = (cat || '').toLowerCase();
    if (c.includes('chrome') || c.includes('devtools')) return <Globe size={13} color="#38bdf8" />;
    if (c.includes('firebase')) return <Flame size={13} color="#f59e0b" />;
    if (c.includes('gemini') || c.includes('ia') || c.includes('agente')) return <Bot size={13} color="#a855f7" />;
    if (c.includes('desenvolvimento') || c.includes('code')) return <Code2 size={13} color="#3b82f6" />;
    if (c.includes('teste') || c.includes('segurança')) return <Shield size={13} color="#ef4444" />;
    if (c.includes('cloud') || c.includes('devops')) return <Cloud size={13} color="#06b6d4" />;
    if (c.includes('design') || c.includes('ui')) return <Palette size={13} color="#ec4899" />;
    if (c.includes('marketing') || c.includes('conteúdo')) return <Share2 size={13} color="#f97316" />;
    return <Compass size={13} color="#22c55e" />;
  };

  const handleUseSkill = useCallback((skill: Skill) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const prompt = `Use a skill ${skill.name} para `;
    onSelectSkill(prompt);
    onClose();
  }, [onSelectSkill, onClose]);

  const renderSkillItem = useCallback(({ item }: { item: Skill }) => (
    <TouchableOpacity
      style={styles.skillCard}
      onPress={() => handleUseSkill(item)}
      activeOpacity={0.7}
    >
      <View style={styles.skillCardTop}>
        <View style={styles.skillCategoryBadge}>
          {getCategoryIcon(item.category)}
          <Text style={styles.skillCategoryText} numberOfLines={1} ellipsizeMode="tail">
            {item.category}
          </Text>
        </View>
        <View style={styles.usePill}>
          <Text style={styles.usePillText}>Usar no Chat</Text>
          <ArrowRight size={11} color="#38bdf8" style={{ marginLeft: 3 }} />
        </View>
      </View>

      <Text style={styles.skillName} numberOfLines={2}>
        {item.name}
      </Text>
      
      <Text style={styles.skillDesc} numberOfLines={3} ellipsizeMode="tail">
        {item.description}
      </Text>
    </TouchableOpacity>
  ), [handleUseSkill]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.dragHandle} />
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <Sparkles size={18} color="#38bdf8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle} numberOfLines={1}>Catálogo de Skills</Text>
                <Text style={styles.headerSub} numberOfLines={1}>
                  {skills.length > 0 ? `${skills.length.toLocaleString('pt-BR')} ferramentas e agentes instalados` : 'Carregando catálogo...'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Busca */}
          <View style={styles.searchBarWrap}>
            <Search size={16} color="#71717a" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nome, ferramenta ou descrição..."
              placeholderTextColor="#71717a"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={15} color="#71717a" />
              </TouchableOpacity>
            )}
          </View>

          {/* Categorias Horizontais */}
          <View style={styles.categoryContainer}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={categories}
              keyExtractor={(cat) => cat}
              contentContainerStyle={styles.categoryList}
              renderItem={({ item: cat }) => {
                const isSelected = selectedCategory === cat;
                return (
                  <TouchableOpacity
                    style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCategory(cat);
                    }}
                  >
                    <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>

          {/* Lista de Skills Virtualizada */}
          {isLoading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.loadingText}>Buscando catálogo no computador...</Text>
            </View>
          ) : filteredSkills.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Sparkles size={40} color="#27272a" />
              <Text style={styles.emptyTitle}>Nenhuma skill encontrada</Text>
              <Text style={styles.emptyDesc}>Tente outros termos de busca ou selecione outra categoria.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredSkills}
              keyExtractor={(item) => item.path || item.name}
              renderItem={renderSkillItem}
              contentContainerStyle={styles.skillsList}
              showsVerticalScrollIndicator={false}
              initialNumToRender={15}
              maxToRenderPerBatch={20}
              windowSize={7}
              removeClippedSubviews={Platform.OS === 'android'}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#09090b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
    height: '86%',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3f3f46',
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSub: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141418',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    paddingVertical: 0,
  },
  categoryContainer: {
    marginTop: 10,
    marginBottom: 8,
  },
  categoryList: {
    paddingVertical: 2,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    backgroundColor: '#141418',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#27272a',
    alignSelf: 'center',
  },
  categoryChipSelected: {
    backgroundColor: '#38bdf8',
    borderColor: '#38bdf8',
  },
  categoryChipText: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryChipTextSelected: {
    color: '#09090b',
    fontWeight: '700',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 10,
    fontSize: 13,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyDesc: {
    color: '#71717a',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  skillsList: {
    paddingTop: 4,
    paddingBottom: 20,
    gap: 10,
  },
  skillCard: {
    backgroundColor: '#141418',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  skillCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  skillCategoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
    flexShrink: 1,
    marginRight: 8,
  },
  skillCategoryText: {
    color: '#e4e4e7',
    fontSize: 11,
    fontWeight: '600',
  },
  usePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexShrink: 0,
  },
  usePillText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  skillName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 5,
    flexWrap: 'wrap',
  },
  skillDesc: {
    color: '#a1a1aa',
    fontSize: 12.5,
    lineHeight: 18,
    flexWrap: 'wrap',
  },
});
