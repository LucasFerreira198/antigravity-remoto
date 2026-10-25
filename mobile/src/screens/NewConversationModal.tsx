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
  Keyboard,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Sparkles, Folder, Send } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { colors, isTabletDevice } from '../theme/colors';
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
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = isTabletDevice(width);
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [model, setModel] = useState<'flash' | 'pro' | 'flash_lite'>('flash');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates ? e.endCoordinates.height : 260)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
      <View style={[styles.overlay, isTablet && styles.overlayTablet]}>
        <View
          style={[
            styles.modalCard,
            isTablet && styles.modalCardTablet,
            {
              paddingBottom: Math.max(insets.bottom, 20) + keyboardHeight,
            },
          ]}
        >
          {/* Drag Handle Indicator */}
          <View style={styles.modalHandle} />

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
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  overlayTablet: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.backgroundModal,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  modalCardTablet: {
    maxWidth: 620,
    width: '100%',
    borderRadius: 24,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    width: 26,
    height: 26,
    borderRadius: 8,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    marginBottom: 16,
  },
  sectionLabel: {
    color: colors.textSecondary,
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
    backgroundColor: colors.backgroundElevated,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
  },
  modelOptionActive: {
    borderColor: colors.primaryViolet,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  modelName: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  modelNameActive: {
    color: '#C4B5FD',
  },
  modelDesc: {
    color: colors.textSecondary,
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
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  projectOptionActive: {
    backgroundColor: colors.primaryViolet,
    borderColor: colors.primaryViolet,
  },
  projectName: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  projectNameActive: {
    color: '#ffffff',
  },
  input: {
    backgroundColor: colors.backgroundPrimary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: colors.primaryViolet,
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  submitBtnDisabled: {
    opacity: 0.45,
    backgroundColor: colors.borderSubtle,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
