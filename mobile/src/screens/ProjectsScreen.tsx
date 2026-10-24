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
  Platform,
} from 'react-native';
import { Folder, Plus, ArrowLeft, X, HardDrive, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { api } from '../services/api';
import { Project } from '../types';

interface ProjectsScreenProps {
  onBack: () => void;
  onSelectProject?: (project: Project) => void;
}

export default function ProjectsScreen({ onBack, onSelectProject }: ProjectsScreenProps) {
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
      Alert.alert('Atenção', 'Informe o caminho da pasta no computador (ex: C:\\Users\\Lucas\\Documents\\GitHub\\MeuApp).');
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <ArrowLeft size={22} color="#f8fafc" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Projetos & Workspaces</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            // Sugestão padrão de pasta
            setNewFolderPath('C:\\Users\\Lucas\\Documents\\GitHub\\');
            setModalVisible(true);
          }}
        >
          <Plus size={20} color="#38bdf8" />
        </TouchableOpacity>
      </View>

      {/* Lista de Projetos */}
      {isLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>Carregando projetos do Antigravity...</Text>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.projectCard}
              activeOpacity={0.7}
              onPress={() => {
                if (onSelectProject) {
                  onSelectProject(item);
                }
              }}
            >
              <View style={styles.projectIconWrap}>
                <Folder size={24} color="#38bdf8" />
              </View>
              <View style={styles.projectInfo}>
                <Text style={styles.projectName}>{item.name}</Text>
                <View style={styles.pathRow}>
                  <HardDrive size={11} color="#64748b" style={{ marginRight: 4 }} />
                  <Text style={styles.projectPath} numberOfLines={1}>
                    {item.folder_path || 'Pasta padrão'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Modal Novo Projeto */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Criar Novo Projeto</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>NOME DO PROJETO</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: NovoSistemaMobile"
              placeholderTextColor="#64748b"
              value={newProjectName}
              onChangeText={setNewProjectName}
            />

            <Text style={styles.inputLabel}>CAMINHO DA PASTA NO COMPUTADOR</Text>
            <TextInput
              style={styles.input}
              placeholder="C:\Users\Lucas\Documents\GitHub\NovoSistema"
              placeholderTextColor="#64748b"
              value={newFolderPath}
              onChangeText={setNewFolderPath}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.createBtn, isCreating && styles.createBtnDisabled]}
              onPress={handleCreateProject}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Check size={18} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.createBtnText}>Criar Projeto</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: '#09090b',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  backBtn: {
    padding: 6,
  },
  headerTitle: {
    color: '#fafafa',
    fontSize: 17,
    fontWeight: '700',
  },
  addBtn: {
    padding: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: 8,
  },
  listContent: {
    padding: 16,
    paddingBottom: 120,
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
  projectCard: {
    backgroundColor: '#141418',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  projectIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  projectInfo: {
    flex: 1,
  },
  projectName: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  projectPath: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#131d2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  inputLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  createBtn: {
    backgroundColor: '#0284c7',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
