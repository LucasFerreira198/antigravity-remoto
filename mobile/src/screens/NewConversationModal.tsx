import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { X, Sparkles, Folder, Send } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { api } from '../services/api';
import { Project } from '../types';

interface NewConversationModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewConversationModal({
  visible,
  onClose,
  onCreated,
}: NewConversationModalProps) {
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [model, setModel] = useState<'flash' | 'pro' | 'flash_lite'>('flash');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      api.getProjects().then((data) => {
        setProjects(data);
        if (data.length > 0 && !selectedProjectId) {
          setSelectedProjectId(data[0].id);
        }
      });
    }
  }, [visible]);

  const handleCreate = async () => {
    if (!prompt.trim()) {
      Alert.alert('Atenção', 'Digite o prompt inicial da conversa.');
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await api.newConversation(
        prompt.trim(),
        model,
        title.trim() || undefined,
        selectedProjectId || undefined
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPrompt('');
      setTitle('');
      onCreated();
      onClose();
    } catch (e: any) {
      Alert.alert('Erro ao iniciar conversa', e.message || 'Falha ao comunicar com o Antigravity.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Image
                source={require('../../assets/icon.png')}
                style={styles.headerLogo}
                resizeMode="contain"
              />
              <Text style={styles.headerTitle}>Nova Conversa</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll}>
            {/* Escolha do Modelo */}
            <Text style={styles.sectionLabel}>MODELO GEMINI</Text>
            <View style={styles.modelsRow}>
              {[
                { id: 'flash', name: '3.8 Flash', desc: 'Rápido & Inteligente' },
                { id: 'pro', name: '3.8 Pro', desc: 'Raciocínio Profundo' },
                { id: 'flash_lite', name: 'Flash Lite', desc: 'Econômico' },
              ].map((m) => {
                const isSelected = model === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.modelOption, isSelected && styles.modelOptionActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setModel(m.id as any);
                    }}
                  >
                    <Text style={[styles.modelName, isSelected && styles.modelNameActive]}>
                      {m.name}
                    </Text>
                    <Text style={styles.modelDesc}>{m.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Escolha do Projeto */}
            <Text style={styles.sectionLabel}>PROJETO / WORKSPACE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectsRow}>
              {projects.map((p) => {
                const isSelected = selectedProjectId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.projectOption, isSelected && styles.projectOptionActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedProjectId(p.id);
                    }}
                  >
                    <Folder size={12} color={isSelected ? '#ffffff' : '#38bdf8'} style={{ marginRight: 6 }} />
                    <Text style={[styles.projectName, isSelected && styles.projectNameActive]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Título Opcional */}
            <Text style={styles.sectionLabel}>TÍTULO (OPCIONAL)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Refatorar API ou Criar Nova Tela"
              placeholderTextColor="#64748b"
              value={title}
              onChangeText={setTitle}
            />

            {/* Prompt Inicial */}
            <Text style={styles.sectionLabel}>O QUE O ANTIGRAVITY DEVE FAZER?</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Digite sua solicitação ou use comandos como /plan..."
              placeholderTextColor="#64748b"
              value={prompt}
              onChangeText={setPrompt}
              multiline
              numberOfLines={4}
            />
          </ScrollView>

          {/* Botão de Envio */}
          <TouchableOpacity
            style={[styles.submitBtn, (!prompt.trim() || isLoading) && styles.submitBtnDisabled]}
            onPress={handleCreate}
            disabled={!prompt.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text style={styles.submitBtnText}>Iniciar Conversa</Text>
                <Send size={18} color="#ffffff" style={{ marginLeft: 8 }} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#131d2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    width: 24,
    height: 24,
    borderRadius: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    marginBottom: 16,
  },
  sectionLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 8,
  },
  modelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modelOption: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 10,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  modelOptionActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(2, 132, 199, 0.2)',
  },
  modelName: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  modelNameActive: {
    color: '#38bdf8',
  },
  modelDesc: {
    color: '#64748b',
    fontSize: 9,
    marginTop: 2,
    textAlign: 'center',
  },
  projectsRow: {
    maxHeight: 46,
    marginBottom: 8,
  },
  projectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  projectOptionActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  projectName: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  projectNameActive: {
    color: '#ffffff',
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
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: '#0284c7',
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
