import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { X, Sparkles, Search, Check, Globe, Flame, Bot, Compass, ArrowRight } from 'lucide-react-native';
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
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');

  useEffect(() => {
    if (visible) {
      loadSkills();
    }
  }, [visible]);

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

  const categories = ['Todas', ...Array.from(new Set(skills.map((s) => s.category)))];

  const filteredSkills = skills.filter((s) => {
    const matchesCategory = selectedCategory === 'Todas' || s.category === selectedCategory;
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryIcon = (cat: string) => {
    if (cat.includes('Chrome') || cat.includes('DevTools')) return <Globe size={14} color="#38bdf8" />;
    if (cat.includes('Firebase')) return <Flame size={14} color="#f59e0b" />;
    if (cat.includes('Gemini')) return <Bot size={14} color="#a855f7" />;
    return <Compass size={14} color="#22c55e" />;
  };

  const handleUseSkill = (skill: Skill) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const prompt = `Use a skill ${skill.name} para `;
    onSelectSkill(prompt);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <Sparkles size={18} color="#38bdf8" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Catálogo de Skills</Text>
                <Text style={styles.headerSub}>
                  {skills.length > 0 ? `${skills.length} ferramentas e agentes no seu PC` : 'Carregando skills...'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
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
          </View>

          {/* Categorias */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
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
            })}
          </ScrollView>

          {/* Lista de Skills */}
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
            <ScrollView contentContainerStyle={styles.skillsList} showsVerticalScrollIndicator={false}>
              {filteredSkills.map((skill) => (
                <TouchableOpacity
                  key={skill.name}
                  style={styles.skillCard}
                  onPress={() => handleUseSkill(skill)}
                  activeOpacity={0.7}
                >
                  <View style={styles.skillCardTop}>
                    <View style={styles.skillCategoryBadge}>
                      {getCategoryIcon(skill.category)}
                      <Text style={styles.skillCategoryText}>{skill.category}</Text>
                    </View>
                    <View style={styles.usePill}>
                      <Text style={styles.usePillText}>Usar no Chat</Text>
                      <ArrowRight size={12} color="#38bdf8" style={{ marginLeft: 4 }} />
                    </View>
                  </View>

                  <Text style={styles.skillName}>{skill.name}</Text>
                  <Text style={styles.skillDesc} numberOfLines={3}>
                    {skill.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
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
    padding: 16,
    height: '84%',
    borderWidth: 1,
    borderColor: '#27272a',
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
    padding: 8,
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
  },
  categoryScroll: {
    maxHeight: 46,
    marginTop: 10,
    marginBottom: 6,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#141418',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#27272a',
    marginRight: 8,
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
    paddingTop: 8,
    paddingBottom: 24,
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
    marginBottom: 4,
  },
  skillDesc: {
    color: '#a1a1aa',
    fontSize: 12.5,
    lineHeight: 18,
  },
});
