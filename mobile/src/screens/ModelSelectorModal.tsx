import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Bot, Check, Zap, Brain, Sparkles, Cpu, Layers } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { api } from '../services/api';
import { ModelOption } from '../types';

interface ModelSelectorModalProps {
  visible: boolean;
  conversationId: string;
  currentModelName?: string;
  onClose: () => void;
  onModelSelected: (modelName: string) => void;
}

export default function ModelSelectorModal({
  visible,
  conversationId,
  currentModelName,
  onClose,
  onModelSelected,
}: ModelSelectorModalProps) {
  const insets = useSafeAreaInsets();
  const [models, setModels] = useState<ModelOption[]>([]);
  const [activeModel, setActiveModel] = useState<string>(currentModelName || 'Gemini 3.8 Flash High');
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadModels();
    }
  }, [visible, conversationId]);

  useEffect(() => {
    if (!visible) return;
    const onBack = () => {
      onClose();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [visible, onClose]);

  const loadModels = async () => {
    setIsLoading(true);
    try {
      const data = await api.getModels(conversationId);
      if (data.available_models && data.available_models.length > 0) {
        setModels(data.available_models);
      }
      if (data.current_model) {
        setActiveModel(data.current_model);
      }
    } catch (e) {
      console.error('Erro ao buscar modelos:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectModel = async (model: ModelOption) => {
    if (isSwitching) return;
    setIsSwitching(model.name);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const ok = await api.setModel(conversationId, model.name);
      if (ok) {
        setActiveModel(model.name);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onModelSelected(model.name);
        setTimeout(() => {
          onClose();
        }, 300);
      }
    } catch (e) {
      console.error('Erro ao trocar modelo:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSwitching(null);
    }
  };

  const getModelIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('flash')) return <Zap size={18} color="#eab308" />;
    if (n.includes('sonnet') || n.includes('thinking')) return <Brain size={18} color="#a855f7" />;
    if (n.includes('opus')) return <Sparkles size={18} color="#ec4899" />;
    if (n.includes('gpt')) return <Cpu size={18} color="#10b981" />;
    return <Bot size={18} color="#38bdf8" />;
  };

  const getModelSubtext = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('flash')) return 'Ultrarrápido, ideal para iterações ágeis e contexto amplo (1M)';
    if (n.includes('sonnet')) return 'Raciocínio avançado passo a passo, excelente para código e lógica';
    if (n.includes('opus')) return 'Máxima inteligência e profundidade para arquiteturas complexas';
    if (n.includes('gpt-oss')) return 'Modelo open-weights com raciocínio balanceado';
    if (n.includes('argon')) return 'Próxima geração de inteligência experimental';
    return 'Modelo padrão configurado no Antigravity';
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <Bot size={18} color="#a855f7" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Modelo da Conversa</Text>
                <Text style={styles.headerSub}>Alterne o motor de IA ativo no PC</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Lista de Modelos */}
          {isLoading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#a855f7" />
              <Text style={styles.loadingText}>Buscando modelos no Antigravity...</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.modelsList} showsVerticalScrollIndicator={false}>
              {models.map((model) => {
                const isCurrent = activeModel.toLowerCase().includes(model.name.toLowerCase()) ||
                  model.name.toLowerCase().includes(activeModel.toLowerCase());
                const isThisSwitching = isSwitching === model.name;

                return (
                  <TouchableOpacity
                    key={model.name}
                    style={[styles.modelCard, isCurrent && styles.modelCardActive]}
                    onPress={() => handleSelectModel(model)}
                    disabled={isCurrent || isSwitching !== null}
                    activeOpacity={0.7}
                  >
                    <View style={styles.modelCardHeader}>
                      <View style={styles.modelIconWrap}>
                        {getModelIcon(model.name)}
                      </View>
                      <View style={styles.modelTitleWrap}>
                        <View style={styles.modelNameRow}>
                          <Text style={[styles.modelName, isCurrent && styles.modelNameActive]} numberOfLines={1}>
                            {model.name}
                          </Text>
                          {model.badge ? (
                            <View style={[styles.badgePill, isCurrent && styles.badgePillActive]}>
                              <Text style={[styles.badgeText, isCurrent && styles.badgeTextActive]}>
                                {model.badge}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.modelSubtext} numberOfLines={2}>
                          {getModelSubtext(model.name)}
                        </Text>
                      </View>

                      <View style={styles.checkWrap}>
                        {isThisSwitching ? (
                          <ActivityIndicator size="small" color="#a855f7" />
                        ) : isCurrent ? (
                          <View style={styles.activeCheckCircle}>
                            <Check size={14} color="#ffffff" strokeWidth={3} />
                          </View>
                        ) : (
                          <View style={styles.inactiveCircle} />
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
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
    paddingTop: 16,
    paddingHorizontal: 16,
    maxHeight: '80%',
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
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
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
  centerLoading: {
    paddingVertical: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 10,
    fontSize: 13,
  },
  modelsList: {
    paddingTop: 14,
    paddingBottom: 16,
    gap: 10,
  },
  modelCard: {
    backgroundColor: '#141418',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  modelCardActive: {
    borderColor: '#a855f7',
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
  },
  modelCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modelIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#1f1f23',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modelTitleWrap: {
    flex: 1,
    marginRight: 10,
  },
  modelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  modelName: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '700',
    flexShrink: 1,
    marginRight: 6,
  },
  modelNameActive: {
    color: '#d8b4fe',
  },
  badgePill: {
    backgroundColor: '#27272a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgePillActive: {
    backgroundColor: '#a855f7',
  },
  badgeText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: '#ffffff',
  },
  modelSubtext: {
    color: '#71717a',
    fontSize: 11.5,
    lineHeight: 16,
  },
  checkWrap: {
    width: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#a855f7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inactiveCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#3f3f46',
  },
});
