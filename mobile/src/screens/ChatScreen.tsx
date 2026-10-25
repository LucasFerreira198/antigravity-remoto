import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Animated,
  AppState,
  BackHandler,
  useWindowDimensions,
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
  Clock,
  Laptop,
  Play,
  Cpu,
  Zap,
  Smartphone,
  CheckCircle2,
  Eye,
  Archive,
  Target,
  Bot,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Markdown from 'react-native-markdown-display';
import { api } from '../services/api';
import { StorageService } from '../services/storage';
import { ConversationWebSocket } from '../services/websocket';
import { Conversation, Message, Artifact, ToolCall, QuestionItem, MediaItem, BackgroundTask, TokenStats, SuggestionItem } from '../types';
import BackgroundTasksModal from './BackgroundTasksModal';
import SkillsCatalogModal from './SkillsCatalogModal';
import ModelSelectorModal from './ModelSelectorModal';
import { colors, isTabletDevice } from '../theme/colors';
import { notificationService } from '../services/notificationService';

interface ChatScreenProps {
  conversation: Conversation;
  onBack: () => void;
  onOpenArtifacts: (conversationId: string) => void;
}

interface QueueItem {
  id: string;
  content: string;
  source: 'mobile' | 'pc';
}

export default function ChatScreen({ conversation, onBack, onOpenArtifacts }: ChatScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = isTabletDevice(width);
  const [messages, setMessages] = useState<Message[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [displayCount, setDisplayCount] = useState(120);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [localQueue, setLocalQueue] = useState<QueueItem[]>([]);
  const [serverQueue, setServerQueue] = useState<QueueItem[]>([]);
  const [desktopPendingText, setDesktopPendingText] = useState<string>('');

  // Novos estados para Tarefas em Segundo Plano, Tokens e Skills
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [showTokensModal, setShowTokensModal] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);
  const [activeModelName, setActiveModelName] = useState<string>(conversation.agent_name || 'Gemini 3.8 Flash High');
  const [isStopping, setIsStopping] = useState(false);
  const prevIsActiveRef = useRef<boolean>(false);

  // Detecção de Plano Aguardando Aprovação (Proceed) - Somente planos pendentes que exigem feedback
  const latestPlanArtifact = useMemo(() => {
    return artifacts.find((a) => a.request_feedback) || null;
  }, [artifacts]);
  const hasPendingPlan = !!latestPlanArtifact;

  // Nome curto do modelo para exibição no botão do header
  const activeModelShortName = useMemo(() => {
    const n = (tokenStats?.active_model || activeModelName || '').toLowerCase();
    if (n.includes('flash')) return 'Flash';
    if (n.includes('sonnet')) return 'Sonnet';
    if (n.includes('opus')) return 'Opus';
    if (n.includes('gpt')) return 'GPT';
    if (n.includes('argon')) return 'Argon';
    return 'Modelo';
  }, [tokenStats?.active_model, activeModelName]);

  // Contagem de tarefas ativas
  const runningTasksCount = useMemo(() => {
    return tasks.filter((t) => t.status === 'running').length;
  }, [tasks]);

  // Fila combinada sem duplicatas (PC e Celular)
  const combinedQueue = useMemo(() => {
    const list: QueueItem[] = [...serverQueue];
    for (const l of localQueue) {
      if (!list.some((item) => item.content.trim() === l.content.trim())) {
        list.push(l);
      }
    }
    return list;
  }, [serverQueue, localQueue]);

  // Animação de pulso sutil do indicador Working
  const workingPulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (isActive || isSending) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(workingPulse, { toValue: 1, duration: 850, useNativeDriver: true }),
          Animated.timing(workingPulse, { toValue: 0.35, duration: 850, useNativeDriver: true }),
        ])
      );
      anim.start();
    } else {
      workingPulse.setValue(0.4);
    }
    return () => {
      anim?.stop();
    };
  }, [isActive, isSending]);

  // Anexo de Imagem
  const [selectedImage, setSelectedImage] = useState<{ uri: string; base64: string; filename: string } | null>(null);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);

  // Parar conversa/execução do Antigravity
  const handleStopConversation = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setIsStopping(true);
    try {
      await api.stopConversation(conversation.id);
      setIsActive(false);
      setTimeout(() => {
        loadHistory();
      }, 500);
    } catch (e) {
      console.error('Erro ao parar conversa:', e);
    } finally {
      setIsStopping(false);
    }
  };

  // Botão voltar físico/gesto do Android dentro do Chat
  useEffect(() => {
    const onBackPress = () => {
      if (showImagePickerModal) {
        setShowImagePickerModal(false);
        return true;
      }
      if (showTasksModal) {
        setShowTasksModal(false);
        return true;
      }
      if (showSkillsModal) {
        setShowSkillsModal(false);
        return true;
      }
      if (showTokensModal) {
        setShowTokensModal(false);
        return true;
      }
      if (showModelModal) {
        setShowModelModal(false);
        return true;
      }
      onBack();
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [showImagePickerModal, showTasksModal, showSkillsModal, showTokensModal, showModelModal, onBack]);

  // Resposta para Pergunta Interativa (ask_question)
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [customAnswer, setCustomAnswer] = useState<Record<string, string>>({});
  const [submittedQuestions, setSubmittedQuestions] = useState<Record<string, string>>({});

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
    loadAuxData();

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
            const freshUserContents = fresh.messages
              .filter((m) => m.role === 'user')
              .map((m) => (m.content || '').trim());
            const pendingOptimistic = prev.filter(
              (m) =>
                m.role === 'user' &&
                m.type === 'user_message' &&
                !freshUserContents.includes((m.content || '').trim())
            );
            const combined = [...fresh.messages, ...pendingOptimistic];

            if (combined.length !== prev.length) {
              StorageService.saveChatCache(conversation.id, fresh.messages, fresh.artifacts || []);
              setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
              return combined;
            }
            if (prev.length > 0 && fresh.messages.length > 0) {
              const lastP = prev[prev.length - 1];
              const lastF = fresh.messages[fresh.messages.length - 1];
              if (lastP.content !== lastF.content || lastP.step_index !== lastF.step_index || lastP.type !== lastF.type) {
                return combined;
              }
            }
            return prev;
          });

          // Notificação Android se o assistente finalizou e o app está em background ou outra tela
          if (prevIsActiveRef.current && fresh.is_active === false) {
            if (AppState.currentState !== 'active') {
              notificationService.notifyTaskCompleted(conversation.title, conversation.id);
            }
          }
          prevIsActiveRef.current = !!fresh.is_active;

          if (fresh.is_active !== undefined) {
            setIsActive(fresh.is_active);
          }
          if (fresh.desktop_pending_text !== undefined) {
            setDesktopPendingText(fresh.desktop_pending_text);
          }
          if (fresh.artifacts) setArtifacts(fresh.artifacts);

          // 1. Remover da fila local mensagens que já foram adicionadas à conversa
          setLocalQueue((prev) => {
            if (prev.length === 0) return prev;
            const userContents = fresh.messages
              .filter((m) => m.role === 'user')
              .map((m) => (m.content || '').trim());
            return prev.filter((item) => !userContents.includes(item.content.trim()));
          });

          // 2. Sincronizar fila do PC vinda do servidor
          if (fresh.queued_messages && fresh.queued_messages.length > 0) {
            const pcItems: QueueItem[] = fresh.queued_messages.map((q) => ({
              id: q.id,
              content: q.content,
              source: 'pc',
            }));
            setServerQueue(pcItems);
          } else {
            setServerQueue([]);
          }
        }
      } catch (e) {}
    }, 1200);

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
      if (data.desktop_pending_text !== undefined) {
        setDesktopPendingText(data.desktop_pending_text);
      }
      if (data.queued_messages && data.queued_messages.length > 0) {
        setServerQueue(data.queued_messages.map((q) => ({
          id: q.id,
          content: q.content,
          source: 'pc',
        })));
      } else {
        setServerQueue([]);
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

  const loadAuxData = async () => {
    try {
      const [ts, bgTasks, suggs] = await Promise.all([
        api.getTokenStats(conversation.id).catch(() => null),
        api.getBackgroundTasks(conversation.id).catch(() => []),
        api.getSuggestions(conversation.id).catch(() => []),
      ]);
      if (ts) setTokenStats(ts);
      if (bgTasks) setTasks(bgTasks);
      if (suggs) setSuggestions(suggs);
    } catch (e) {}
  };

  // Envio de mensagem ou resposta interativa
  const handleSend = async (overrideText?: string, isQuestionAnswer = false) => {
    const textToSend = (overrideText || inputPrompt).trim();
    if (!textToSend && !selectedImage) return;

    setInputPrompt('');
    const imagePayload = selectedImage ? { base64: selectedImage.base64, filename: selectedImage.filename } : undefined;
    const tempImageUri = selectedImage?.uri;
    setSelectedImage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Se o assistente já estiver trabalhando (e NÃO for resposta a uma pergunta interativa)
    if (isActive && !isQuestionAnswer) {
      const qId = Date.now().toString();
      setLocalQueue((prev) => [...prev, { id: qId, content: textToSend, source: 'mobile' }]);
      setIsSending(true);
      try {
        await api.sendMessage(conversation.id, textToSend, undefined, imagePayload);
        loadAuxData();
      } catch (e) {
        console.error('Erro ao enviar mensagem para a fila:', e);
      } finally {
        setIsSending(false);
      }
      return;
    }

    // Mensagem otimista imediata na tela (quando o agente está livre)
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
    setIsSending(true);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      await api.sendMessage(conversation.id, textToSend, undefined, imagePayload);
      loadAuxData();

      // Polling de garantia enquanto o modelo responde
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      let attempts = 0;
      pollTimerRef.current = setInterval(async () => {
        attempts++;
        try {
          const fresh = await api.getConversation(conversation.id);
          if (fresh && fresh.messages) {
            setMessages((prev) => {
              const freshUserContents = fresh.messages
                .filter((m) => m.role === 'user')
                .map((m) => (m.content || '').trim());
              const pendingOptimistic = prev.filter(
                (m) =>
                  m.role === 'user' &&
                  m.type === 'user_message' &&
                  !freshUserContents.includes((m.content || '').trim())
              );
              return [...fresh.messages, ...pendingOptimistic];
            });
            if (fresh.artifacts) setArtifacts(fresh.artifacts);
            if (!fresh.is_active) {
              setIsSending(false);
              setIsActive(false);
              clearInterval(pollTimerRef.current);
              loadAuxData();
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
    let questions: QuestionItem[] = toolCall.questions || (toolCall as any).args?.questions || [];
    if (typeof questions === 'string') {
      try {
        questions = JSON.parse(questions);
      } catch (e) {
        questions = [];
      }
    }
    if (!Array.isArray(questions) || questions.length === 0) return null;

    return (
      <View style={styles.questionCard}>
        <View style={styles.questionHeader}>
          <HelpCircle size={16} color="#f59e0b" style={{ marginRight: 6 }} />
          <Text style={styles.questionTitle}>Pergunta do Antigravity</Text>
        </View>

        {questions.map((q: QuestionItem, qIdx: number) => {
          const selected = questionAnswers[`${stepKey}_${qIdx}`] || '';
          const optionsList = Array.isArray(q.options) ? q.options : [];
          return (
            <View key={qIdx} style={styles.questionBody}>
              <Text style={styles.questionPrompt}>{q.question}</Text>
              <View style={styles.optionsWrap}>
                {optionsList.map((opt: string, optIdx: number) => {
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
              {submittedQuestions[stepKey] ? (
                <View style={styles.questionAnsweredBanner}>
                  <Check size={14} color="#10b981" style={{ marginRight: 6 }} />
                  <Text style={styles.questionAnsweredText}>
                    Resposta confirmada: {submittedQuestions[stepKey]}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.submitAnswerBtn,
                    !selected && !customAnswer[`${stepKey}_${qIdx}`] && styles.submitAnswerBtnDisabled,
                  ]}
                  disabled={!selected && !customAnswer[`${stepKey}_${qIdx}`]}
                  onPress={() => {
                    const finalChoice = customAnswer[`${stepKey}_${qIdx}`] || selected;
                    if (finalChoice) {
                      setSubmittedQuestions((prev) => ({ ...prev, [stepKey]: finalChoice }));
                      handleSend(finalChoice, true);
                    }
                  }}
                >
                  <Check size={14} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.submitAnswerBtnText}>Confirmar e Enviar Resposta</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  // Janela de renderização ampla com garantia de visibilidade da pergunta do usuário
  const displayedMessages = useMemo(() => {
    if (messages.length <= displayCount) return messages;
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx !== -1 && messages.length - lastUserIdx >= displayCount) {
      return messages.slice(lastUserIdx);
    }
    return messages.slice(-displayCount);
  }, [messages, displayCount]);
  const hasMoreMessages = messages.length > displayedMessages.length;

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: keyboardHeight > 0 ? keyboardHeight : Math.max(insets.bottom, 6),
        },
      ]}
    >
      <View style={[styles.mainWrapper, isTablet && styles.mainWrapperTablet]}>
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

        <View style={styles.headerRightActions}>
          {/* Botão de Parar Execução (Ativo durante execução) */}
          {isActive && (
            <TouchableOpacity
              style={styles.stopHeaderBtn}
              onPress={handleStopConversation}
              disabled={isStopping}
              activeOpacity={0.8}
            >
              {isStopping ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Square size={11} color="#ffffff" fill="#ffffff" style={{ marginRight: 4 }} />
                  <Text style={styles.stopHeaderBtnText}>Parar</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Seletor de Modelo com Tokens Integrados */}
          <TouchableOpacity
            style={styles.modelHeaderBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowModelModal(true);
            }}
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowTokensModal(true);
            }}
            activeOpacity={0.7}
          >
            <Bot size={13} color="#c084fc" style={{ marginRight: 3 }} />
            <Text style={styles.modelHeaderText} numberOfLines={1}>
              {activeModelShortName}
            </Text>
            {tokenStats && tokenStats.current_context_tokens > 0 && (
              <Text style={styles.modelTokensSub}>
                •{(tokenStats.current_context_tokens / 1000).toFixed(0)}k
              </Text>
            )}
          </TouchableOpacity>

          {/* Badge de Tarefas em Segundo Plano */}
          {runningTasksCount > 0 && (
            <TouchableOpacity
              style={styles.tasksHeaderBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowTasksModal(true);
              }}
              activeOpacity={0.7}
            >
              <Terminal size={15} color="#4ade80" />
              <View style={styles.tasksHeaderBadge}>
                <Text style={styles.tasksHeaderBadgeText}>{runningTasksCount}</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Botão de Artefatos */}
          {artifacts.length > 0 && (
            <TouchableOpacity
              style={[styles.artifactsBtn, hasPendingPlan && styles.artifactsBtnHighlight]}
              onPress={() => onOpenArtifacts(conversation.id)}
              activeOpacity={0.7}
            >
              <FileText size={17} color={hasPendingPlan ? '#34d399' : '#38bdf8'} />
              <View style={[styles.artifactsBadge, hasPendingPlan && { backgroundColor: '#059669' }]}>
                <Text style={styles.artifactsBadgeText}>{artifacts.length}</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
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
                  <Text style={styles.toolTitleText} numberOfLines={1}>
                    {tc.title || tc.name}
                  </Text>
                  {isExpanded ? (
                    <ChevronDown size={14} color="#64748b" style={{ marginLeft: 6 }} />
                  ) : (
                    <ChevronRight size={14} color="#64748b" style={{ marginLeft: 6 }} />
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
              <Animated.Text style={[styles.workingText, { opacity: workingPulse }]}>
                Working
              </Animated.Text>
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

      {/* Texto Aguardando no Computador */}
      {desktopPendingText && desktopPendingText !== inputPrompt ? (
        <View style={styles.desktopPendingCard}>
          <View style={styles.desktopPendingHeader}>
            <Laptop size={12} color="#38bdf8" style={{ marginRight: 6 }} />
            <Text style={styles.desktopPendingTitle}>Digitado no PC (Aguardando Envio)</Text>
          </View>
          <Text style={styles.desktopPendingText} numberOfLines={2}>
            {desktopPendingText}
          </Text>
          <View style={styles.desktopPendingActions}>
            <TouchableOpacity
              style={styles.desktopPendingBtnSecondary}
              onPress={() => {
                setInputPrompt(desktopPendingText);
              }}
            >
              <Text style={styles.desktopPendingBtnTextSecondary}>Copiar para Celular</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.desktopPendingBtnPrimary}
              onPress={() => {
                const toSend = desktopPendingText;
                setDesktopPendingText('');
                handleSend(toSend);
              }}
            >
              <Send size={12} color="#ffffff" style={{ marginRight: 4 }} />
              <Text style={styles.desktopPendingBtnTextPrimary}>Enviar ao Chat</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Mensagens na Fila de Envio (PC e Celular) */}
      {combinedQueue.length > 0 && (
        <View style={styles.queuedCard}>
          <View style={styles.queuedHeaderRow}>
            <Clock size={12} color="#f59e0b" style={{ marginRight: 6 }} />
            <Text style={styles.queuedTitle}>Na fila de envio ({combinedQueue.length})</Text>
          </View>
          {combinedQueue.map((item, qIdx) => (
            <View key={item.id || qIdx} style={styles.queuedItemRow}>
              <View style={styles.queuedContentWrap}>
                <View
                  style={[
                    styles.sourceBadge,
                    item.source === 'pc' ? styles.sourceBadgePc : styles.sourceBadgeMobile,
                  ]}
                >
                  <Text style={styles.sourceBadgeText}>
                    {item.source === 'pc' ? 'PC' : 'Celular'}
                  </Text>
                </View>
                <Text style={styles.queuedText} numberOfLines={2}>
                  {item.content}
                </Text>
              </View>
              <View style={styles.queuedActionRow}>
                {!isActive ? (
                  <TouchableOpacity
                    style={styles.queuedSendBtn}
                    onPress={() => {
                      handleSend(item.content);
                      setLocalQueue((prev) => prev.filter((q) => q.id !== item.id));
                      setServerQueue((prev) => prev.filter((q) => q.id !== item.id));
                    }}
                  >
                    <Send size={11} color="#ffffff" style={{ marginRight: 4 }} />
                    <Text style={styles.queuedSendBtnText}>Enviar Agora</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.queuedWaitingPill}>
                    <Clock size={11} color="#f59e0b" style={{ marginRight: 4 }} />
                    <Text style={styles.queuedWaitingPillText}>Na fila do PC...</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.queuedEditBtn}
                  onPress={() => {
                    setInputPrompt(item.content);
                    setLocalQueue((prev) => prev.filter((q) => q.id !== item.id));
                    setServerQueue((prev) => prev.filter((q) => q.id !== item.id));
                  }}
                >
                  <Text style={styles.queuedEditText}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.queuedRemoveBtn}
                  onPress={() => {
                    setLocalQueue((prev) => prev.filter((q) => q.id !== item.id));
                    setServerQueue((prev) => prev.filter((q) => q.id !== item.id));
                  }}
                >
                  <X size={13} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Banner de Plano Pronto para Aprovação (Proceed) */}
      {hasPendingPlan && !isActive && (
        <View style={styles.proceedCard}>
          <View style={styles.proceedCardLeft}>
            <View style={styles.proceedIconCircle}>
              <Play size={14} color="#ffffff" fill="#ffffff" />
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.proceedCardTitle}>Plano Pronto para Execução</Text>
              <Text style={styles.proceedCardSub} numberOfLines={1}>
                {latestPlanArtifact?.summary || 'O agente elaborou um plano e aguarda aprovação.'}
              </Text>
            </View>
          </View>
          <View style={styles.proceedCardButtons}>
            <TouchableOpacity
              style={styles.proceedViewBtn}
              onPress={() => onOpenArtifacts(conversation.id)}
            >
              <Text style={styles.proceedViewBtnText}>Ver Plano</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.proceedActionBtn, isSending && styles.proceedActionBtnDisabled]}
              onPress={() => handleSend('Proceed')}
              disabled={isSending}
            >
              <Play size={12} color="#ffffff" fill="#ffffff" style={{ marginRight: 5 }} />
              <Text style={styles.proceedActionBtnText}>Proceed</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Barra Unificada de Ações Rápidas & Sugestões */}
      <View style={styles.quickActionsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickActionsContent}
        >
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
          {suggestions.map((sug) => {
            const isHighlight = sug.highlight;
            return (
              <TouchableOpacity
                key={sug.id}
                style={[styles.suggestionChip, isHighlight && styles.suggestionChipHighlight]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (sug.type === 'instant_execute') {
                    handleSend(sug.prompt);
                  } else {
                    setInputPrompt(sug.prompt);
                  }
                }}
              >
                {sug.icon === 'play' && <Play size={11} color="#ffffff" fill="#ffffff" style={{ marginRight: 4 }} />}
                {sug.icon === 'smartphone' && <Smartphone size={11} color="#38bdf8" style={{ marginRight: 4 }} />}
                {sug.icon === 'check-circle' && <CheckCircle2 size={11} color="#34d399" style={{ marginRight: 4 }} />}
                {sug.icon === 'eye' && <Eye size={11} color="#f59e0b" style={{ marginRight: 4 }} />}
                {sug.icon === 'zap' && <Zap size={11} color="#eab308" style={{ marginRight: 4 }} />}
                {sug.icon === 'archive' && <Archive size={11} color="#94a3b8" style={{ marginRight: 4 }} />}
                {sug.icon === 'target' && <Target size={11} color="#a855f7" style={{ marginRight: 4 }} />}
                <Text style={[styles.suggestionChipText, isHighlight && styles.suggestionChipTextHighlight]}>
                  {sug.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Input de Envio Shadcn com Foco Inteligente */}
      <View style={styles.inputContainer}>
        {/* Botão de Anexo de Foto */}
        <TouchableOpacity
          style={styles.attachBtn}
          onPress={() => setShowImagePickerModal(true)}
        >
          <ImageIcon size={20} color="#38bdf8" />
        </TouchableOpacity>

        {/* Botão de Catálogo de Skills */}
        <TouchableOpacity
          style={styles.skillsBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowSkillsModal(true);
          }}
        >
          <Sparkles size={18} color="#a855f7" />
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

        {isActive && !inputPrompt.trim() && !selectedImage ? (
          <TouchableOpacity
            style={styles.stopInputBtn}
            onPress={handleStopConversation}
            disabled={isStopping}
            activeOpacity={0.8}
          >
            {isStopping ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Square size={16} color="#ffffff" fill="#ffffff" />
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendBtn, (!inputPrompt.trim() && !selectedImage) && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!inputPrompt.trim() && !selectedImage}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Send size={18} color="#ffffff" />
            )}
          </TouchableOpacity>
        )}
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

      {/* Modal de Tarefas em Segundo Plano */}
      <BackgroundTasksModal
        visible={showTasksModal}
        conversationId={conversation.id}
        onClose={() => setShowTasksModal(false)}
      />

      {/* Modal de Catálogo de Skills */}
      <SkillsCatalogModal
        visible={showSkillsModal}
        onClose={() => setShowSkillsModal(false)}
        onSelectSkill={(prompt) => {
          setInputPrompt((prev) => (prev ? `${prev} ${prompt}` : prompt));
        }}
      />

      {/* Modal de Seleção de Modelo */}
      <ModelSelectorModal
        visible={showModelModal}
        conversationId={conversation.id}
        currentModelName={tokenStats?.active_model || activeModelName}
        onClose={() => setShowModelModal(false)}
        onModelSelected={(m) => {
          setActiveModelName(m);
          loadHistory();
        }}
      />

      {/* Modal de Detalhes de Tokens & Totem do Modelo */}
      <Modal
        visible={showTokensModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTokensModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTokensModal(false)}
        >
          <View style={[styles.tokenModalCard, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
            <View style={styles.tokenModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Cpu size={18} color="#38bdf8" style={{ marginRight: 8 }} />
                <Text style={styles.tokenModalTitle}>Totem do Modelo & Janela</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTokensModal(false)}>
                <X size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {tokenStats ? (
              <View style={styles.tokenModalBody}>
                <View style={styles.tokenRow}>
                  <Text style={styles.tokenLabel}>Modelo Ativo</Text>
                  <Text style={styles.tokenValueHighlight}>{tokenStats.active_model}</Text>
                </View>

                <View style={styles.tokenProgressWrap}>
                  <View style={styles.tokenProgressHeader}>
                    <Text style={styles.tokenProgressLabel}>Janela de Contexto Utilizada</Text>
                    <Text style={styles.tokenProgressPercent}>{tokenStats.context_percent_used}%</Text>
                  </View>
                  <View style={styles.tokenProgressBar}>
                    <View
                      style={[
                        styles.tokenProgressFill,
                        { width: `${Math.min(tokenStats.context_percent_used, 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.tokenProgressDetails}>
                    {tokenStats.current_context_tokens.toLocaleString()} /{' '}
                    {tokenStats.context_window_size.toLocaleString()} tokens
                  </Text>
                </View>

                <View style={styles.tokenStatsGrid}>
                  <View style={styles.tokenGridItem}>
                    <Text style={styles.tokenGridTitle}>Cache Read</Text>
                    <Text style={styles.tokenGridValue}>
                      {tokenStats.latest_cache_read_tokens.toLocaleString()}
                    </Text>
                    <Text style={styles.tokenGridSub}>{tokenStats.cache_savings_percent}% economia</Text>
                  </View>
                  <View style={styles.tokenGridItem}>
                    <Text style={styles.tokenGridTitle}>Prompt Recente</Text>
                    <Text style={styles.tokenGridValue}>
                      {tokenStats.latest_input_tokens.toLocaleString()}
                    </Text>
                    <Text style={styles.tokenGridSub}>tokens entrada</Text>
                  </View>
                  <View style={styles.tokenGridItem}>
                    <Text style={styles.tokenGridTitle}>Tokens Resposta</Text>
                    <Text style={styles.tokenGridValue}>
                      {tokenStats.latest_output_tokens.toLocaleString()}
                    </Text>
                    <Text style={styles.tokenGridSub}>gerados agora</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#38bdf8" />
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
      </View>
    </View>
  );
}

// ----------------- ESTILOS SHADCN DARK OBSIDIAN -----------------

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
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 38,
    paddingBottom: 12,
    backgroundColor: colors.backgroundElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.backgroundModal,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginRight: 10,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  headerSubText: {
    color: colors.textSecondary,
    fontSize: 12,
    maxWidth: 150,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.statusEmerald,
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
    backgroundColor: colors.backgroundModal,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  artifactsBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.accentCyan,
    borderRadius: 10,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  artifactsBadgeText: {
    color: '#090A0F',
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
    backgroundColor: colors.backgroundModal,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 20,
    marginBottom: 14,
  },
  loadMoreText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primaryViolet,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '85%',
    marginVertical: 4,
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  userText: {
    color: '#ffffff',
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
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    padding: 14,
    marginVertical: 8,
  },
  assistantCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingBottom: 6,
  },
  assistantAvatar: {
    width: 20,
    height: 20,
    borderRadius: 6,
    marginRight: 8,
  },
  assistantName: {
    color: colors.primaryViolet,
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
  questionAnsweredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  questionAnsweredText: {
    color: '#10b981',
    fontSize: 12,
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
  desktopPendingCard: {
    backgroundColor: '#0c1929',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 14,
    marginBottom: 6,
  },
  desktopPendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  desktopPendingTitle: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  desktopPendingText: {
    color: '#e2e8f0',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
  },
  desktopPendingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  desktopPendingBtnSecondary: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  desktopPendingBtnTextSecondary: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  desktopPendingBtnPrimary: {
    backgroundColor: '#0284c7',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  desktopPendingBtnTextPrimary: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  queuedCard: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 14,
    marginBottom: 6,
  },
  queuedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  queuedTitle: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '700',
  },
  queuedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  queuedContentWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  sourceBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginRight: 6,
  },
  sourceBadgePc: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  sourceBadgeMobile: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  sourceBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#f8fafc',
  },
  queuedText: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  queuedActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  queuedSendBtn: {
    backgroundColor: '#0284c7',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  queuedSendBtnText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  queuedEditBtn: {
    backgroundColor: '#27272a',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  queuedEditText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '600',
  },
  queuedRemoveBtn: {
    padding: 3,
  },
  quickActionsContainer: {
    paddingVertical: 6,
    backgroundColor: colors.backgroundElevated,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  quickActionsContent: {
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
  },
  slashChip: {
    backgroundColor: colors.backgroundModal,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  slashChipText: {
    color: colors.accentCyan,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.backgroundElevated,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  attachBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.backgroundModal,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  skillsBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.backgroundModal,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.textPrimary,
    fontSize: 14,
  },
  sendBtn: {
    width: 42,
    height: 42,
    backgroundColor: colors.primaryViolet,
    borderRadius: 12,
    marginLeft: 6,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  sendBtnDisabled: {
    opacity: 0.35,
  },
  scrollBottomBtn: {
    position: 'absolute',
    bottom: 95,
    right: 20,
    backgroundColor: colors.primaryViolet,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: '#12141c',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#252836',
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
    borderBottomColor: '#252836',
  },
  pickerOptionText: {
    color: '#fafafa',
    fontSize: 14,
    fontWeight: '500',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stopHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#dc2626',
    borderRadius: 8,
  },
  stopHeaderBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  modelHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#151720',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(192, 132, 252, 0.35)',
  },
  modelHeaderText: {
    color: '#e9d5ff',
    fontSize: 11,
    fontWeight: '700',
    maxWidth: 68,
  },
  modelTokensSub: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 3,
  },
  stopInputBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tasksHeaderBtn: {
    position: 'relative',
    padding: 8,
    backgroundColor: '#18181b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.4)',
  },
  tasksHeaderBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#22c55e',
    borderRadius: 9,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tasksHeaderBadgeText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '800',
  },
  tokensHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#18181b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272a',
    gap: 4,
  },
  tokensHeaderText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  artifactsBtnHighlight: {
    borderColor: 'rgba(52, 211, 153, 0.6)',
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
  },
  proceedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#064e3b',
    borderWidth: 1,
    borderColor: '#059669',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 14,
    marginBottom: 8,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  proceedCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  proceedIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  proceedCardTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  proceedCardSub: {
    color: '#a7f3d0',
    fontSize: 11,
    marginTop: 1,
  },
  proceedCardButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  proceedViewBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  proceedViewBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  proceedActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  proceedActionBtnDisabled: {
    opacity: 0.6,
  },
  proceedActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  suggestionsScroll: {
    maxHeight: 38,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
    alignSelf: 'center',
  },
  suggestionChipHighlight: {
    backgroundColor: '#064e3b',
    borderColor: '#10b981',
  },
  suggestionChipText: {
    color: '#a1a1aa',
    fontSize: 11.5,
    fontWeight: '600',
  },
  suggestionChipTextHighlight: {
    color: '#ffffff',
    fontWeight: '700',
  },
  queuedWaitingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  queuedWaitingPillText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '600',
  },
  tokenModalCard: {
    backgroundColor: '#09090b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  tokenModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    marginBottom: 14,
  },
  tokenModalTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  tokenModalBody: {
    gap: 14,
  },
  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tokenLabel: {
    color: '#71717a',
    fontSize: 13,
  },
  tokenValueHighlight: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },
  tokenProgressWrap: {
    backgroundColor: '#141418',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  tokenProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tokenProgressLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
  },
  tokenProgressPercent: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  tokenProgressBar: {
    height: 8,
    backgroundColor: '#27272a',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  tokenProgressFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 4,
  },
  tokenProgressDetails: {
    color: '#71717a',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  tokenStatsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  tokenGridItem: {
    flex: 1,
    backgroundColor: '#141418',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center',
  },
  tokenGridTitle: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  tokenGridValue: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  tokenGridSub: {
    color: '#22c55e',
    fontSize: 10,
    marginTop: 2,
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
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  heading2: {
    color: '#60a5fa',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  heading3: {
    color: '#93c5fd',
    fontSize: 13.5,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 2,
  },
  code_inline: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    color: '#38bdf8',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  code_block: {
    backgroundColor: '#070a12',
    borderWidth: 1,
    borderColor: '#1e2433',
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#f8fafc',
    fontSize: 12,
  },
  fence: {
    backgroundColor: '#070a12',
    borderWidth: 1,
    borderColor: '#1e2433',
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#f8fafc',
    fontSize: 12,
  },
  blockquote: {
    backgroundColor: 'rgba(56, 189, 248, 0.06)',
    borderLeftColor: '#38bdf8',
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginVertical: 6,
    borderRadius: 4,
  },
  table: {
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 6,
    marginVertical: 6,
  },
  th: {
    backgroundColor: '#18181b',
    padding: 6,
    fontWeight: '700',
    color: '#f8fafc',
  },
  td: {
    padding: 6,
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    color: '#e2e8f0',
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
