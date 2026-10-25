import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FolderGit2, Plus, ArrowLeft, X, GitBranch, HardDrive, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { colors, isTabletDevice } from '../theme/colors';
import { api } from '../services/api';
import { Project } from '../types';

interface ProjectsScreenProps {
  onBack: () => void;
  onSelectProject?: (project: Project) => void;
  selectedProjectId?: string;
}

export default function ProjectsScreen({
  onBack,
  onSelectProject,
  selectedProjectId,
}: ProjectsScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = isTabletDevice(width);

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newFolderPath, setNewFolderPath] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (e) {
      console.error('Erro ao carregar projetos:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      Alert.alert('Atenção', 'Informe o nome do projeto.');
      return;
    }
    if (!newFolderPath.trim()) {
      Alert.alert('Atenção', 'Informe o caminho da pasta no computador.');
      return;
    }

    setIsCreating(true);
    try {
      await api.createProject(newProjectName.trim(), newFolderPath.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewProjectName('');
      setNewFolderPath('');
      setModalVisible(false);
      loadProjects();
    } catch (e: any) {
      Alert.alert('Erro ao criar projeto', e.message || 'Falha ao salvar o projeto no computador.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.mainWrapper, isTablet && styles.mainWrapperTablet]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <ArrowLeft size={20} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Projetos no Workspace</Text>
            <Text style={styles.headerSubtitle}>Sincronizado via antigravity_service.py</Text>
          </View>

          <TouchableOpacity
            style={styles.addBtn}
            activeOpacity={0.8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setNewFolderPath('C:\\Users\\Lucas\\Documents\\GitHub\\');
              setModalVisible(true);
            }}
          >
            <Plus size={18} color="#ffffff" strokeWidth={2.6} />
          </TouchableOpacity>
        </View>

        {/* Resumo do topo */}
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>Repositórios Registrados</Text>
          <View style={styles.repoBadge}>
            <Text style={styles.repoBadgeText}>{projects.length} repos</Text>
          </View>
        </View>

        {/* Lista de Projetos (1 coluna Smartphone, 2 colunas Tablet) */}
        {isLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={colors.primaryViolet} />
            <Text style={styles.loadingText}>Carregando projetos do computador...</Text>
          </View>
        ) : (
          <FlatList
            key={isTablet ? 'tablet-projects-grid' : 'mobile-projects-list'}
            data={projects}
            numColumns={isTablet ? 2 : 1}
            keyExtractor={(item) => item.id}
            columnWrapperStyle={isTablet ? styles.tabletRow : undefined}
            contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
            renderItem={({ item }) => {
              const isSelected = selectedProjectId === item.id;
              return (
                <TouchableOpacity
                  style={[
                    styles.projectCard,
                    isTablet && styles.projectCardTablet,
                    isSelected && styles.projectCardSelected,
                  ]}
                  activeOpacity={0.75}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    if (onSelectProject) {
                      onSelectProject(item);
                    }
                  }}
                >
                  <View style={styles.cardTopRow}>
                    <View
                      style={[
                        styles.projectIconWrap,
                        isSelected && styles.projectIconWrapSelected,
                      ]}
                    >
                      <FolderGit2
                        size={18}
                        color={isSelected ? '#ffffff' : colors.accentCyan}
                      />
                    </View>
                    <View style={styles.projectInfo}>
                      <View style={styles.nameRow}>
                        <Text style={styles.projectName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {isSelected && (
                          <View style={styles.activePill}>
                            <Text style={styles.activePillText}>Ativo</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.pathRow}>
                        <HardDrive size={11} color={colors.textSecondary} style={{ marginRight: 4 }} />
                        <Text style={styles.projectPath} numberOfLines={1}>
                          {item.folder_path || 'Pasta padrão do workspace'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.cardBottomRow}>
                    <View style={styles.branchWrap}>
                      <GitBranch size={12} color={colors.accentCyan} style={{ marginRight: 4 }} />
                      <Text style={styles.branchText}>main</Text>
                    </View>
                    <Text style={styles.techText}>React Native • FastAPI • CDP</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Modal Novo Projeto */}
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalCard,
                isTablet && styles.modalCardTablet,
                { paddingBottom: Math.max(insets.bottom, 20) + 12 },
              ]}
            >
              <View style={styles.dragHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Adicionar Projeto / Workspace</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                  <X size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>NOME DO PROJETO</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: NovoProjetoAntigravity"
                placeholderTextColor={colors.textSecondary}
                value={newProjectName}
                onChangeText={setNewProjectName}
              />

              <Text style={styles.inputLabel}>CAMINHO ABSOLUTO NO COMPUTADOR</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: C:\Users\Lucas\Documents\GitHub\NovoProjeto"
                placeholderTextColor={colors.textSecondary}
                value={newFolderPath}
                onChangeText={setNewFolderPath}
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[styles.saveBtn, isCreating && styles.saveBtnDisabled]}
                onPress={handleCreateProject}
                disabled={isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Check size={18} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.saveBtnText}>Salvar Projeto no Workspace</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.backgroundElevated,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.backgroundModal,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primaryViolet,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  repoBadge: {
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  repoBadgeText: {
    color: colors.accentCyan,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
  },
  tabletRow: {
    justifyContent: 'space-between',
    gap: 12,
  },
  projectCard: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: 16,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  projectCardTablet: {
    flex: 1,
    marginBottom: 12,
  },
  projectCardSelected: {
    borderColor: colors.primaryViolet,
    backgroundColor: '#161828',
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  projectIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.backgroundModal,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  projectIconWrapSelected: {
    backgroundColor: colors.primaryViolet,
    borderColor: colors.primaryViolet,
  },
  projectInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  projectName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  activePill: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  activePillText: {
    color: '#C4B5FD',
    fontSize: 10,
    fontWeight: '700',
  },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  projectPath: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(35, 39, 56, 0.8)',
  },
  branchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  branchText: {
    color: colors.accentCyan,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  techText: {
    color: colors.textSecondary,
    fontSize: 11,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.backgroundModal,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  modalCardTablet: {
    maxWidth: 540,
    width: '100%',
    alignSelf: 'center',
    borderRadius: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.backgroundPrimary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  saveBtn: {
    backgroundColor: colors.primaryViolet,
    borderRadius: 14,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
