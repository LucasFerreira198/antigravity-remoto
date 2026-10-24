import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Clipboard,
  Alert,
  Image,
  Modal,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Send,
  Sparkles,
  Terminal,
  FileText,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Folder,
  ArrowDown,
  Image as ImageIcon,
  Camera,
  X,
  HelpCircle,
  FileCode,
  Globe,
  Radio,
  CheckSquare,
  Square,
  Circle,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Markdown from 'react-native-markdown-display';
import { api } from '../services/api';
import { StorageService } from '../services/storage';
import { ConversationWebSocket } from '../services/websocket';
import { Conversation, Message, Artifact, ToolCall, QuestionItem, MediaItem } from '../types';

interface ChatScreenProps {
  conversation: Conversation;
  onBack: () => void;
  onOpenArtifacts: (conversationId: string) => void;
}

export default function ChatScreen({ conversation, onBack, onOpenArtifacts }: ChatScreenProps) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [displayCount, setDisplayCount] = useState(35);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Anexo de Imagem
  const [selectedImage, setSelectedImage] = useState<{ uri: string; base64: string; filename: string } | null>(null);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);

  // Resposta para Pergunta Interativa (ask_question)
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [customAnswer, setCustomAnswer] = useState<Record<string, string>>({});

  const flatListRef = useRef<FlatList>(null);
  const wsRef = useRef<ConversationWebSocket | null>(null);
  const pollTimerRef = useRef<any>(null);

  // Monitorar altura do teclado virtual
  useEffect(() => {
    const onShow = (e: any) => {
      const h = e.endCoordinates ? e.endCoordinates.height : 280;
      setKeyboardHeight(h);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 80);
    };
    const onHide = () => {
      setKeyboardHeight(0);
    };

    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      onShow
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      onHide
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // 1. Carregamento inicial (Cache instantâneo local + busca em rede + sync contínuo)
  useEffect(() => {
    let isMounted = true;

    // Cache local instantâneo (0ms de espera)
    StorageService.getChatCache(conversation.id).then((cached) => {
      if (isMounted && cached && cached.messages && cached.messages.length > 0) {
        setMessages(cached.messages);
        if (cached.artifacts) setArtifacts(cached.artifacts);
      }
    });

    // Busca fresca na rede em segundo plano
    loadHistory(false);

    // WebSocket em tempo real com eventos ao vivo
    const ws = new ConversationWebSocket(conversation.id, (payload) => {
      handleLiveEvent(payload);
    });
    ws.connect();
    wsRef.current = ws;

    // Sincronização contínua a cada 2.5s (garante que mensagens do PC apareçam na hora)
    const autoSyncTimer = setInterval(async () => {
      if (!isMounted) return;
      try {
        const fresh = await api.getConversation(conversation.id);
        if (fresh && fresh.messages) {
          setMessages((prev) => {
            if (fresh.messages.length !== prev.length) {
              StorageService.saveChatCache(conversation.id, fresh.messages, fresh.artifacts || []);
              setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
              return fresh.messages;
            }
            // Checar se a última mensagem mudou (ex: progresso de stream ou novo tool call)
            if (prev.length > 0 && fresh.messages.length > 0) {
              const lastP = prev[prev.length - 1];
              const lastF = fresh.messages[fresh.messages.length - 1];
              if (lastP.content !== lastF.content || lastP.step_index !== lastF.step_index || lastP.type !== lastF.type) {
                return fresh.messages;
              }
            }
            return prev;
          });
          if (fresh.is_active !== undefined) setIsActive(fresh.is_active);
          if (fresh.artifacts) setArtifacts(fresh.artifacts);
        }
      } catch (e) {}
    }, 2500);

    return () => {
      isMounted = false;
      ws.disconnect();
      clearInterval(autoSyncTimer);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [conversation.id]);

  const loadHistory = async (scrollAfter = false) => {
    try {
      const data = await api.getConversation(conversation.id);
      if (data.messages) {
        setMessages(data.messages);
        StorageService.saveChatCache(conversation.id, data.messages, data.artifacts || []);
      }
      if (data.artifacts) {
        setArtifacts(data.artifacts);
      }
      if (data.is_active !== undefined) {
        setIsActive(data.is_active);
      }
      if (scrollAfter) {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 150);
      }
    } catch (e) {
      console.warn('Erro ao carregar mensagens:', e);
    }
  };

  const handleLiveEvent = (payload: any) => {
    // 1. Histórico inicial ou atualização completa
    if ((payload.event === 'initial_history' || payload.event === 'transcript_updated') && payload.messages) {
      setMessages(payload.messages);
      if (payload.artifacts) setArtifacts(payload.artifacts);
      if (payload.is_active !== undefined) setIsActive(payload.is_active);
      setIsSending(false);
      StorageService.saveChatCache(conversation.id, payload.messages, payload.artifacts || []);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return;
    }

    // 2. Stream incremental se houver
    if (payload.event === 'stream_step' && payload.raw) {
      const raw = payload.raw;
      if (raw.event === 'result') {
        setIsSending(false);
        setIsActive(false);
        loadHistory(true);
      }
    }
  };

  // Envio de mensagem ou resposta interativa
  const handleSend = async (overrideText?: string) => {
    const textToSend = (overrideText || inputPrompt).trim();
    if (!textToSend && !selectedImage) return;
    if (isSending) return;

    setIsSending(true);
    setInputPrompt('');
    const imagePayload = selectedImage ? { base64: selectedImage.base64, filename: selectedImage.filename } : undefined;
    const tempImageUri = selectedImage?.uri;
    setSelectedImage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Mensagem otimista imediata na tela
    const tempIndex = messages.length ? Math.max(...messages.map((m) => m.step_index)) + 1 : 1;
    const optimisticMsg: Message = {
      role: 'user',
      step_index: tempIndex,
      created_at: new Date().toISOString(),
      content: textToSend,
      media: tempImageUri ? [{ mime_type: 'image/png', filename: 'upload.png', local_uri: tempImageUri }] : undefined,
      type: 'user_message',
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setIsActive(true);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      await api.sendMessage(conversation.id, textToSend, undefined, imagePayload);

      // Polling de garantia enquanto o modelo responde
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      let attempts = 0;
      pollTimerRef.current = setInterval(async () => {
        attempts++;
        try {
          const fresh = await api.getConversation(conversation.id);
          if (fresh.messages && fresh.messages.length > 0) {
            setMessages(fresh.messages);
            if (fresh.artifacts) setArtifacts(fresh.artifacts);
            if (!fresh.is_active) {
              setIsSending(false);
              setIsActive(false);
              clearInterval(pollTimerRef.current);
            }
          }
        } catch (e) {}
        if (attempts >= 40) {
          clearInterval(pollTimerRef.current);
          setIsSending(false);
          setIsActive(false);
        }
      }, 1000);

    } catch (e: any) {
      Alert.alert('Erro ao enviar', e.message || 'Falha na comunicação com o Antigravity.');
      setIsSending(false);
      setIsActive(false);
    }
  };

  // Seleção de Imagens
  const pickImageFromGallery = async () => {
    setShowImagePickerModal(false);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Permita o acesso às fotos para enviar imagens.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          setSelectedImage({
            uri: asset.uri,
            base64: asset.base64,
            filename: asset.fileName || `image_${Date.now()}.png`,
          });
          Haptics.selectionAsync();
        }
      }
    } catch (e: any) {
      Alert.alert('Erro ao carregar imagem', e.message);
    }
  };

  const takePhotoWithCamera = async () => {
    setShowImagePickerModal(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Permita o acesso à câmera para tirar fotos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          setSelectedImage({
            uri: asset.uri,
            base64: asset.base64,
            filename: `photo_${Date.now()}.jpg`,
          });
          Haptics.selectionAsync();
        }
      }
    } catch (e: any) {
      Alert.alert('Erro na câmera', e.message);
    }
  };

  const toggleThought = (key: string) => {
    Haptics.selectionAsync();
    setExpandedThoughts((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTool = (key: string) => {
    Haptics.selectionAsync();
    setExpandedTools((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const copyToClipboard = (text: string, idx: number) => {
    Clipboard.setString(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const scrollToBottom = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  // Ícone visual por tipo de ferramenta
  const renderToolIcon = (icon?: string) => {
    switch (icon) {
      case 'python':
        return <Text style={styles.badgeEmoji}>🐍</Text>;
      case 'react':
        return <Text style={styles.badgeEmoji}>⚛</Text>;
      case 'typescript':
        return <Text style={styles.badgeTextSmall}>TS</Text>;
      case 'terminal':
        return <Terminal size={13} color="#38bdf8" />;
      case 'search':
        return <Globe size={13} color="#60a5fa" />;
      case 'question':
        return <HelpCircle size={13} color="#f59e0b" />;
      default:
        return <FileCode size={13} color="#94a3b8" />;
    }
  };

  // Renderizador de pergunta interativa (ask_question)
  const renderInteractiveQuestion = (toolCall: ToolCall, stepKey: string) => {
    const questions = toolCall.questions || [];
    if (questions.length === 0) return null;

    return (
      <View style={styles.questionCard}>
        <View style={styles.questionHeader}>
          <HelpCircle size={16} color="#f59e0b" style={{ marginRight: 6 }} />
          <Text style={styles.questionTitle}>Pergunta do Antigravity</Text>
        </View>

        {questions.map((q, qIdx) => {
          const selected = questionAnswers[`${stepKey}_${qIdx}`] || '';
          return (
            <View key={qIdx} style={styles.questionBody}>
              <Text style={styles.questionPrompt}>{q.question}</Text>
              <View style={styles.optionsWrap}>
                {q.options.map((opt, optIdx) => {
                  const isSelected = selected === opt;
                  return (
                    <TouchableOpacity
                      key={optIdx}
                      style={[styles.optionBtn, isSelected && styles.optionBtnSelected]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setQuestionAnswers((prev) => ({ ...prev, [`${stepKey}_${qIdx}`]: opt }));
                      }}
                      activeOpacity={0.7}
                    >
                      {isSelected ? (
                        <Circle size={14} color="#38bdf8" fill="#38bdf8" style={{ marginRight: 8 }} />
                      ) : (
                        <Circle size={14} color="#64748b" style={{ marginRight: 8 }} />
                      )}
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Opção de resposta digitada */}
              <TextInput
                style={styles.customAnswerInput}
                placeholder="Ou digite outra resposta..."
                placeholderTextColor="#64748b"
                value={customAnswer[`${stepKey}_${qIdx}`] || ''}
                onChangeText={(text) => {
                  setCustomAnswer((prev) => ({ ...prev, [`${stepKey}_${qIdx}`]: text }));
                  if (text) {
                    setQuestionAnswers((prev) => ({ ...prev, [`${stepKey}_${qIdx}`]: text }));
                  }
                }}
              />

              {/* Botão de Enviar Resposta */}
              <TouchableOpacity
                style={[
                  styles.submitAnswerBtn,
                  !selected && !customAnswer[`${stepKey}_${qIdx}`] && styles.submitAnswerBtnDisabled,
                ]}
                disabled={!selected && !customAnswer[`${stepKey}_${qIdx}`]}
                onPress={() => {
                  const finalChoice = customAnswer[`${stepKey}_${qIdx}`] || selected;
                  if (finalChoice) {
                    handleSend(finalChoice);
                  }
                }}
              >
                <Check size={14} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.submitAnswerBtnText}>Confirmar e Enviar Resposta</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };

  // Janela de renderização para fluidez
  const displayedMessages = messages.slice(-displayCount);
  const hasMoreMessages = messages.length > displayCount;

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: keyboardHeight > 0 ? keyboardHeight : Math.max(insets.bottom, 6),
        },
      ]}
    >
      {/* Cabeçalho Shadcn Obsidian */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <ArrowLeft size={20} color="#f8fafc" />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {conversation.title}
          </Text>
          <View style={styles.headerSubRow}>
            <Folder size={11} color="#38bdf8" style={{ marginRight: 4 }} />
            <Text style={styles.headerSubText} numberOfLines={1}>
              {conversation.project_name}
            </Text>
            {isActive && (
              <View style={styles.activePill}>
                <View style={styles.activeDot} />
                <Text style={styles.activePillText}>Executando turnos</Text>
              </View>
            )}
          </View>
        </View>

        {artifacts.length > 0 && (
          <TouchableOpacity
            style={styles.artifactsBtn}
            onPress={() => onOpenArtifacts(conversation.id)}
          >
            <FileText size={18} color="#38bdf8" />
            <View style={styles.artifactsBadge}>
              <Text style={styles.artifactsBadgeText}>{artifacts.length}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Lista de Mensagens & Timeline do Desktop */}
      <FlatList
        ref={flatListRef}
        style={{ flex: 1 }}
        data={displayedMessages}
        keyExtractor={(item, index) => `${item.step_index}-${item.type}-${index}`}
        contentContainerStyle={[styles.messagesList, { paddingBottom: 170 }]}
        ListHeaderComponent={
          hasMoreMessages ? (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={() => setDisplayCount((prev) => prev + 35)}
            >
              <Text style={styles.loadMoreText}>
                Carregar mensagens anteriores ({messages.length - displayCount} restantes)
              </Text>
            </TouchableOpacity>
          ) : null
        }
        onContentSizeChange={() => {
          if (!showScrollBottom) {
            flatListRef.current?.scrollToEnd({ animated: true });
          }
        }}
        onLayout={() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }}
        onScroll={(e) => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 120;
          setShowScrollBottom(!isCloseToBottom);
        }}
        scrollEventThrottle={100}
        renderItem={({ item, index }) => {
          const stepKey = `${item.step_index}_${index}`;

          // 1. Mensagem do Usuário
          if (item.type === 'user_message') {
            return (
              <View style={styles.userBubble}>
                {item.media && item.media.length > 0 && (
                  <View style={styles.userMediaContainer}>
                    {item.media.map((m: MediaItem, mIdx: number) => (
                      <Image
                        key={mIdx}
                        source={{ uri: m.local_uri || api.getMediaUrl(conversation.id, m.filename) }}
                        style={styles.userMediaImage}
                        resizeMode="cover"
                      />
                    ))}
                  </View>
                )}
                {item.content ? <Text style={styles.userText}>{item.content}</Text> : null}
              </View>
            );
          }

          // 2. Raciocínio Interno (Thought for Xs >)
          if (item.type === 'thought_step') {
            const isExpanded = !!expandedThoughts[stepKey];
            return (
              <View style={styles.timelineItem}>
                <TouchableOpacity
                  style={styles.thoughtAccordionHeader}
                  onPress={() => toggleThought(stepKey)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.thoughtLabelText}>{item.thought_label || 'Thought for 5s'}</Text>
                  {isExpanded ? (
                    <ChevronDown size={14} color="#64748b" style={{ marginLeft: 6 }} />
                  ) : (
                    <ChevronRight size={14} color="#64748b" style={{ marginLeft: 6 }} />
                  )}
                </TouchableOpacity>

                {isExpanded && item.thinking && (
                  <View style={styles.thoughtExpandedBox}>
                    <Markdown style={thoughtMarkdownStyles}>{item.thinking}</Markdown>
                  </View>
                )}
              </View>
            );
          }

          // 3. Ferramentas Executadas (Analyzed 🐍 / Ran check transcript...)
          if (item.type === 'tool_step' && item.tool_call) {
            const tc = item.tool_call;
            const isExpanded = !!expandedTools[stepKey];

            // Se for pergunta interativa
            if (tc.name === 'ask_question') {
              return renderInteractiveQuestion(tc, stepKey);
            }

            return (
              <View style={styles.timelineItem}>
                <TouchableOpacity
                  style={styles.toolAccordionHeader}
                  onPress={() => toggleTool(stepKey)}
                  activeOpacity={0.7}
                >
                  <View style={styles.toolIconWrap}>{renderToolIcon(tc.icon)}</View>
                  <Text style={styles.toolTitleText} numberOfLines={1}>
                    {tc.title || tc.name}
                  </Text>
                  {isExpanded ? (
                    <ChevronDown size={14} color="#64748b" style={{ marginLeft: 'auto' }} />
                  ) : (
                    <ChevronRight size={14} color="#64748b" style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>

                {isExpanded && tc.detail && (
                  <View style={styles.toolDetailBox}>
                    <Text style={styles.toolDetailText} selectable>
                      {tc.detail}
                    </Text>
                  </View>
                )}
              </View>
            );
          }

          // 4. Resposta do Assistente (Markdown formatado)
          if (item.type === 'assistant_message' || item.type === 'planner_response') {
            const content = item.content || '';
            if (!content.trim()) return null;

            return (
              <View style={styles.assistantCard}>
                <View style={styles.assistantCardHeader}>
                  <Image
                    source={require('../../assets/icon.png')}
                    style={styles.assistantAvatar}
                  />
                  <Text style={styles.assistantName}>Antigravity</Text>
                  <TouchableOpacity
                    style={styles.copyBtn}
                    onPress={() => copyToClipboard(content, index)}
                  >
                    {copiedIndex === index ? (
                      <Check size={14} color="#34d399" />
                    ) : (
                      <Copy size={14} color="#94a3b8" />
                    )}
                  </TouchableOpacity>
                </View>

                <Markdown style={markdownStyles}>{content}</Markdown>
              </View>
            );
          }

          return null;
        }}
        ListFooterComponent={
          (isActive || isSending) ? (
            <View style={styles.workingRow}>
              <Text style={styles.workingText}>Working</Text>
            </View>
          ) : null
        }
      />

      {/* Botão Flutuante de Rolar para Baixo */}
      {showScrollBottom && (
        <TouchableOpacity style={styles.scrollBottomBtn} onPress={scrollToBottom}>
          <ArrowDown size={18} color="#ffffff" />
        </TouchableOpacity>
      )}

      {/* Preview de Imagem Anexada */}
      {selectedImage && (
        <View style={styles.imagePreviewWrap}>
          <Image source={{ uri: selectedImage.uri }} style={styles.imagePreviewThumb} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.imagePreviewTitle} numberOfLines={1}>
              {selectedImage.filename}
            </Text>
            <Text style={styles.imagePreviewSub}>Imagem pronta para envio</Text>
          </View>
          <TouchableOpacity
            style={styles.removeImageBtn}
            onPress={() => setSelectedImage(null)}
          >
            <X size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      )}

      {/* Barra de Ações Rápidas (Slash Commands) */}
      <View style={styles.slashCommandsBar}>
        {['/plan', '/goal', '/compact', '/browser'].map((cmd) => (
          <TouchableOpacity
            key={cmd}
            style={styles.slashChip}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setInputPrompt((prev) => (prev ? `${cmd} ${prev}` : `${cmd} `));
            }}
          >
            <Text style={styles.slashChipText}>{cmd}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Input de Envio Shadcn com Foco Inteligente */}
      <View style={styles.inputContainer}>
        {/* Botão de Anexo de Foto */}
        <TouchableOpacity
          style={styles.attachBtn}
          onPress={() => setShowImagePickerModal(true)}
          disabled={isSending}
        >
          <ImageIcon size={20} color="#38bdf8" />
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Digite para o Antigravity..."
          placeholderTextColor="#64748b"
          value={inputPrompt}
          onChangeText={setInputPrompt}
          onFocus={() => {
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 150);
          }}
          multiline
          maxLength={8000}
        />

        <TouchableOpacity
          style={[styles.sendBtn, (!inputPrompt.trim() && !selectedImage) && styles.sendBtnDisabled]}
          onPress={() => handleSend()}
          disabled={(!inputPrompt.trim() && !selectedImage) || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Send size={18} color="#ffffff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Modal de Escolha da Imagem */}
      <Modal
        visible={showImagePickerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImagePickerModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowImagePickerModal(false)}
        >
          <View style={styles.pickerModalContent}>
            <Text style={styles.pickerModalTitle}>Anexar Imagem</Text>

            <TouchableOpacity style={styles.pickerOption} onPress={takePhotoWithCamera}>
              <Camera size={20} color="#38bdf8" style={{ marginRight: 12 }} />
              <Text style={styles.pickerOptionText}>Tirar Foto com a Câmera</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.pickerOption} onPress={pickImageFromGallery}>
              <ImageIcon size={20} color="#34d399" style={{ marginRight: 12 }} />
              <Text style={styles.pickerOptionText}>Escolher da Galeria</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pickerOption, { borderBottomWidth: 0 }]}
              onPress={() => setShowImagePickerModal(false)}
            >
              <Text style={[styles.pickerOptionText, { color: '#ef4444' }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ----------------- ESTILOS SHADCN DARK OBSIDIAN -----------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 38,
    paddingBottom: 12,
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  backBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    marginRight: 10,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    color: '#fafafa',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  headerSubText: {
    color: '#a1a1aa',
    fontSize: 12,
    maxWidth: 150,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064e3b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34d399',
    marginRight: 4,
  },
  activePillText: {
    color: '#6ee7b7',
    fontSize: 10,
    fontWeight: '600',
  },
  artifactsBtn: {
    position: 'relative',
    padding: 8,
    backgroundColor: '#18181b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  artifactsBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#0284c7',
    borderRadius: 10,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  artifactsBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  messagesList: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  loadMoreBtn: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 20,
    marginBottom: 14,
  },
  loadMoreText: {
    color: '#a1a1aa',
    fontSize: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '85%',
    marginVertical: 4,
  },
  userText: {
    color: '#f8fafc',
    fontSize: 15,
    lineHeight: 22,
  },
  userMediaContainer: {
    marginBottom: 8,
  },
  userMediaImage: {
    width: 200,
    height: 150,
    borderRadius: 10,
  },
  timelineItem: {
    marginVertical: 2,
    paddingLeft: 6,
  },
  thoughtAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  thoughtLabelText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '500',
  },
  thoughtExpandedBox: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
  },
  toolAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  toolIconWrap: {
    marginRight: 6,
    width: 18,
    alignItems: 'center',
  },
  badgeEmoji: {
    fontSize: 12,
  },
  badgeTextSmall: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  toolTitleText: {
    color: '#94a3b8',
    fontSize: 13,
    flex: 1,
  },
  toolDetailBox: {
    backgroundColor: '#090d16',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    padding: 8,
    marginVertical: 4,
  },
  toolDetailText: {
    color: '#38bdf8',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  workingRow: {
    paddingVertical: 6,
    paddingLeft: 6,
  },
  workingText: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '500',
  },
  assistantCard: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    marginVertical: 8,
  },
  assistantCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingBottom: 6,
  },
  assistantAvatar: {
    width: 18,
    height: 18,
    borderRadius: 4,
    marginRight: 8,
  },
  assistantName: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  copyBtn: {
    padding: 4,
  },
  questionCard: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 12,
    padding: 14,
    marginVertical: 8,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  questionTitle: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '700',
  },
  questionBody: {
    marginTop: 4,
  },
  questionPrompt: {
    color: '#fafafa',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  optionsWrap: {
    gap: 8,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27272a',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  optionBtnSelected: {
    borderColor: '#38bdf8',
    backgroundColor: '#082f49',
  },
  optionText: {
    color: '#e4e4e7',
    fontSize: 13,
    flex: 1,
  },
  optionTextSelected: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  customAnswerInput: {
    backgroundColor: '#27272a',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#fafafa',
    fontSize: 13,
    marginTop: 10,
  },
  submitAnswerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 10,
  },
  submitAnswerBtnDisabled: {
    opacity: 0.5,
  },
  submitAnswerBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  imagePreviewWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 10,
    padding: 8,
    marginHorizontal: 14,
    marginBottom: 6,
  },
  imagePreviewThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  imagePreviewTitle: {
    color: '#fafafa',
    fontSize: 12,
    fontWeight: '600',
  },
  imagePreviewSub: {
    color: '#34d399',
    fontSize: 11,
  },
  removeImageBtn: {
    padding: 6,
  },
  slashCommandsBar: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 4,
    gap: 8,
  },
  slashChip: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  slashChipText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0d1117',
    borderTopWidth: 1,
    borderTopColor: '#27272a',
  },
  attachBtn: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    marginRight: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fafafa',
    fontSize: 14,
  },
  sendBtn: {
    padding: 10,
    backgroundColor: '#0284c7',
    borderRadius: 10,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  scrollBottomBtn: {
    position: 'absolute',
    bottom: 95,
    right: 20,
    backgroundColor: '#0284c7',
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: '#18181b',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  pickerModalTitle: {
    color: '#fafafa',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  pickerOptionText: {
    color: '#fafafa',
    fontSize: 14,
    fontWeight: '500',
  },
});

const markdownStyles = StyleSheet.create({
  body: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 22,
  },
  heading1: {
    color: '#38bdf8',
    fontSize: 19,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  heading2: {
    color: '#60a5fa',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  heading3: {
    color: '#93c5fd',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 2,
  },
  code_inline: {
    backgroundColor: '#1e293b',
    color: '#38bdf8',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  code_block: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#38bdf8',
    fontSize: 12,
  },
  blockquote: {
    backgroundColor: '#0c1a2e',
    borderLeftColor: '#38bdf8',
    borderLeftWidth: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginVertical: 4,
  },
  link: {
    color: '#38bdf8',
    textDecorationLine: 'underline',
  },
});

const thoughtMarkdownStyles = StyleSheet.create({
  body: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  code_inline: {
    backgroundColor: '#1e293b',
    color: '#cbd5e1',
    borderRadius: 3,
    paddingHorizontal: 4,
    fontSize: 11,
  },
});
