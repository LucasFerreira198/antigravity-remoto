import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Clipboard,
  Platform,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, FileText, Copy, Check, ArrowLeft, Image as ImageIcon, Play, CheckCircle, Code, Eye, AlertTriangle, RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Markdown from 'react-native-markdown-display';
import { colors, isTabletDevice } from '../theme/colors';
import { api } from '../services/api';
import { Artifact } from '../types';

interface ArtifactViewerModalProps {
  visible: boolean;
  conversationId: string;
  initialArtifacts?: Artifact[];
  onClose: () => void;
  onProceedSent?: () => void;
}

export default function ArtifactViewerModal({
  visible,
  conversationId,
  initialArtifacts,
  onClose,
  onProceedSent,
}: ArtifactViewerModalProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = isTabletDevice(width);
  const [artifacts, setArtifacts] = useState<Artifact[]>(initialArtifacts || []);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [contentData, setContentData] = useState<any>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'markdown' | 'raw'>('markdown');
  const [isLoadingList, setIsLoadingList] = useState(!initialArtifacts || initialArtifacts.length === 0);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isProceeding, setIsProceeding] = useState(false);

  useEffect(() => {
    if (visible) {
      if (initialArtifacts && initialArtifacts.length > 0) {
        setArtifacts(initialArtifacts);
        setIsLoadingList(false);
      }
      if (conversationId) {
        loadArtifacts();
      }
    }
  }, [visible, conversationId, initialArtifacts]);

  useEffect(() => {
    if (!visible) return;
    const onBackPress = () => {
      if (selectedArtifact) {
        setSelectedArtifact(null);
        setContentData(null);
        setContentError(null);
        return true;
      }
      onClose();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [visible, selectedArtifact]);

  const loadArtifacts = async () => {
    if (!artifacts.length) {
      setIsLoadingList(true);
    }
    try {
      const data = await api.getConversation(conversationId);
      if (data && data.artifacts) {
        setArtifacts(data.artifacts);
      }
    } catch (e) {
      console.warn('Erro ao atualizar artefatos:', e);
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleProceed = async () => {
    setIsProceeding(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await api.sendMessage(conversationId, 'Proceed');
      onProceedSent?.();
      onClose();
    } catch (e) {
      console.error('Erro ao enviar Proceed:', e);
    } finally {
      setIsProceeding(false);
    }
  };

  const handleSelectArtifact = async (art: Artifact) => {
    setSelectedArtifact(art);
    setContentData(null);
    setContentError(null);
    setViewMode('markdown');
    setIsLoadingContent(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const data = await api.getArtifact(conversationId, art.name);
      if (!data) {
        throw new Error('Artefato não retornado pelo servidor.');
      }
      setContentData(data);
    } catch (e: any) {
      console.error('Erro ao obter conteúdo do artefato:', e);
      setContentError(e?.message || 'Falha de conexão ao carregar o relatório.');
    } finally {
      setIsLoadingContent(false);
    }
  };

  const copyContent = () => {
    if (contentData?.content) {
      Clipboard.setString(contentData.content);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, isTablet && styles.overlayTablet]}>
        <View
          style={[
            styles.modalCard,
            isTablet && styles.modalCardTablet,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
        >
          <View style={styles.dragHandle} />
          {/* Header */}
          <View style={styles.header}>
            {selectedArtifact ? (
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => {
                  setSelectedArtifact(null);
                  setContentData(null);
                }}
              >
                <ArrowLeft size={20} color="#f8fafc" />
              </TouchableOpacity>
            ) : null}
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {selectedArtifact ? selectedArtifact.name : 'Artefatos da Conversa'}
              </Text>
            </View>
            {selectedArtifact && !contentData?.is_binary && (
              <TouchableOpacity
                style={[styles.modeToggleBtn, viewMode === 'raw' && styles.modeToggleBtnActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setViewMode((prev) => (prev === 'markdown' ? 'raw' : 'markdown'));
                }}
                activeOpacity={0.7}
              >
                {viewMode === 'markdown' ? (
                  <Code size={15} color="#38bdf8" />
                ) : (
                  <Eye size={15} color="#10b981" />
                )}
                <Text style={[styles.modeToggleText, viewMode === 'raw' && styles.modeToggleTextActive]}>
                  {viewMode === 'markdown' ? 'Raw' : 'MD'}
                </Text>
              </TouchableOpacity>
            )}
            {selectedArtifact && !contentData?.is_binary ? (
              <TouchableOpacity style={styles.actionBtn} onPress={copyContent}>
                {copied ? <Check size={18} color="#34d399" /> : <Copy size={18} color="#94a3b8" />}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onClose} style={styles.actionBtn}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Conteúdo */}
          {isLoadingList ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.loadingText}>Carregando artefatos...</Text>
            </View>
          ) : selectedArtifact ? (
            <View style={{ flex: 1 }}>
              {isLoadingContent ? (
                <View style={styles.centerLoading}>
                  <ActivityIndicator size="large" color="#38bdf8" />
                  <Text style={styles.loadingText}>Abrindo arquivo...</Text>
                </View>
              ) : contentError ? (
                <View style={styles.centerLoading}>
                  <AlertTriangle size={36} color="#f43f5e" style={{ marginBottom: 12 }} />
                  <Text style={styles.errorTitle}>Erro ao carregar documento</Text>
                  <Text style={styles.errorDesc}>{contentError}</Text>
                  <TouchableOpacity
                    style={styles.retryBtn}
                    onPress={() => handleSelectArtifact(selectedArtifact)}
                    activeOpacity={0.8}
                  >
                    <RefreshCw size={14} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.retryBtnText}>Tentar Novamente</Text>
                  </TouchableOpacity>
                </View>
              ) : contentData?.is_binary ? (
                <ScrollView style={styles.scrollFlex} contentContainerStyle={styles.imageScroll}>
                  <Image
                    source={{ uri: `data:image/png;base64,${contentData.base64_data}` }}
                    style={styles.artifactImage}
                    resizeMode="contain"
                  />
                </ScrollView>
              ) : (
                <ScrollView
                  style={styles.scrollFlex}
                  contentContainerStyle={styles.textScroll}
                  showsVerticalScrollIndicator={true}
                >
                  {viewMode === 'markdown' && selectedArtifact?.is_markdown ? (
                    <Markdown style={markdownStyles}>
                      {contentData?.content || ''}
                    </Markdown>
                  ) : (
                    <Text style={styles.artifactText} selectable>
                      {contentData?.content || ''}
                    </Text>
                  )}
                </ScrollView>
              )}

              {selectedArtifact?.request_feedback ? (
                <View style={styles.proceedFooter}>
                  <TouchableOpacity
                    style={[styles.proceedBtn, isProceeding && styles.proceedBtnDisabled]}
                    onPress={handleProceed}
                    disabled={isProceeding}
                    activeOpacity={0.8}
                  >
                    {isProceeding ? (
                      <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                    ) : (
                      <Play size={18} color="#ffffff" fill="#ffffff" style={{ marginRight: 8 }} />
                    )}
                    <Text style={styles.proceedBtnText}>
                      {isProceeding ? 'Enviando Proceed...' : 'Proceed (Executar Plano)'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : selectedArtifact?.is_plan || selectedArtifact?.name.toLowerCase().includes('plan') ? (
                <View style={styles.executedPlanFooter}>
                  <CheckCircle size={16} color="#10b981" style={{ marginRight: 6 }} />
                  <Text style={styles.executedPlanText}>Plano já executado / aprovado</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.listScroll}>
              {artifacts.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <FileText size={40} color="#334155" />
                  <Text style={styles.emptyTitle}>Nenhum artefato criado ainda</Text>
                  <Text style={styles.emptyDesc}>
                    Planos, relatórios e imagens criados pelo Antigravity aparecerão aqui.
                  </Text>
                </View>
              ) : (
                artifacts.map((art) => (
                  <TouchableOpacity
                    key={art.name}
                    style={styles.artifactCard}
                    onPress={() => handleSelectArtifact(art)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.iconWrap}>
                      {art.is_image ? (
                        <ImageIcon size={22} color="#38bdf8" />
                      ) : (
                        <FileText size={22} color="#38bdf8" />
                      )}
                    </View>
                    <View style={styles.infoWrap}>
                      <Text style={styles.artName} numberOfLines={1}>
                        {art.name}
                      </Text>
                      {art.summary ? (
                        <Text style={styles.artSummary} numberOfLines={2}>
                          {art.summary}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))
              )}
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
  overlayTablet: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalCard: {
    backgroundColor: colors.backgroundModal,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    height: '85%',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  modalCardTablet: {
    maxWidth: 760,
    width: '100%',
    borderRadius: 24,
    height: '80%',
  },
  proceedFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.backgroundElevated,
  },
  proceedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.statusEmerald,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: colors.statusEmerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  proceedBtnDisabled: {
    opacity: 0.6,
  },
  proceedBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  executedPlanFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    marginTop: 8,
  },
  executedPlanText: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  actionBtn: {
    padding: 6,
    marginLeft: 6,
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
  listScroll: {
    paddingBottom: 24,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyDesc: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  artifactCard: {
    backgroundColor: '#141418',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoWrap: {
    flex: 1,
  },
  artName: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  artSummary: {
    color: '#94a3b8',
    fontSize: 12,
  },
  scrollFlex: {
    flex: 1,
  },
  textScroll: {
    padding: 12,
    paddingBottom: 40,
  },
  modeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 4,
  },
  modeToggleBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  modeToggleText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  modeToggleTextActive: {
    color: '#10b981',
  },
  errorTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  errorDesc: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  artifactText: {
    color: '#f8fafc',
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  imageScroll: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  artifactImage: {
    width: '100%',
    height: 350,
  },
});

const markdownStyles = StyleSheet.create({
  // Obrigatório no Android: define a cor padrão de todos os nós de texto
  text: {
    color: '#f8fafc',
    fontSize: 14,
    lineHeight: 22,
  },
  body: {
    color: '#f8fafc',
    fontSize: 14,
    lineHeight: 22,
  },
  paragraph: {
    color: '#f8fafc',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 0,
    marginBottom: 10,
  },
  textgroup: {
    color: '#f8fafc',
  },
  heading1: {
    color: '#38bdf8',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 8,
  },
  heading2: {
    color: '#60a5fa',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
  },
  heading3: {
    color: '#93c5fd',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 4,
  },
  heading4: {
    color: '#bfdbfe',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  hr: {
    backgroundColor: '#334155',
    height: 1,
    marginVertical: 12,
  },
  strong: {
    fontWeight: '700',
    color: '#ffffff',
  },
  em: {
    fontStyle: 'italic',
    color: '#e2e8f0',
  },
  s: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  link: {
    color: '#38bdf8',
    textDecorationLine: 'underline',
  },
  bullet_list: {
    marginVertical: 6,
  },
  ordered_list: {
    marginVertical: 6,
  },
  list_item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 3,
  },
  bullet_list_icon: {
    marginLeft: 4,
    marginRight: 8,
    color: '#38bdf8',
    fontSize: 14,
  },
  bullet_list_content: {
    flex: 1,
    color: '#f8fafc',
  },
  ordered_list_icon: {
    marginLeft: 4,
    marginRight: 8,
    color: '#38bdf8',
    fontSize: 13,
  },
  ordered_list_content: {
    flex: 1,
    color: '#f8fafc',
  },
  code_inline: {
    backgroundColor: '#1e293b',
    color: '#38bdf8',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  code_block: {
    backgroundColor: '#0a0f1d',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    color: '#f8fafc',
    fontSize: 12.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  fence: {
    backgroundColor: '#0a0f1d',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    color: '#f8fafc',
    fontSize: 12.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  blockquote: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderLeftColor: '#38bdf8',
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 8,
    borderRadius: 4,
  },
  table: {
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 6,
    marginVertical: 8,
  },
  th: {
    backgroundColor: '#1e293b',
    padding: 8,
    borderColor: '#334155',
    borderWidth: 0.5,
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  td: {
    padding: 8,
    borderColor: '#334155',
    borderWidth: 0.5,
    color: '#f8fafc',
    fontSize: 13,
  },
  tr: {
    borderBottomWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
  },
});
