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
} from 'react-native';
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
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { api } from '../services/api';
import { ConversationWebSocket } from '../services/websocket';
import { Conversation, Message, Artifact } from '../types';

interface ChatScreenProps {
  conversation: Conversation;
  onBack: () => void;
  onOpenArtifacts: (conversationId: string) => void;
}

export default function ChatScreen({ conversation, onBack, onOpenArtifacts }: ChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<number, boolean>>({});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const wsRef = useRef<ConversationWebSocket | null>(null);

  // Carregar histórico inicial
  const loadHistory = async () => {
    try {
      const data = await api.getConversation(conversation.id);
      setMessages(data.messages || []);
      setArtifacts(data.artifacts || []);
    } catch (e) {
      console.error('Erro ao carregar mensagens:', e);
    }
  };

  useEffect(() => {
    loadHistory();

    // Iniciar WebSocket para streaming ao vivo
    const ws = new ConversationWebSocket(conversation.id, (step) => {
      handleLiveStep(step);
    });
    ws.connect();
    wsRef.current = ws;

    return () => {
      ws.disconnect();
    };
  }, [conversation.id]);

  const handleLiveStep = (step: any) => {
    const stepType = step.type;
    const source = step.source;

    setMessages((prev) => {
      const existingIdx = prev.findIndex((m) => m.step_index === step.step_index && m.type === (
        stepType === 'USER_INPUT' ? 'user_message' :
        stepType === 'PLANNER_RESPONSE' ? 'planner_response' : 'assistant_message'
      ));

      let newMsg: Message | null = null;
      if (stepType === 'USER_INPUT') {
        newMsg = {
          role: 'user',
          step_index: step.step_index,
          created_at: step.created_at || new Date().toISOString(),
          content: step.content || '',
          type: 'user_message',
        };
      } else if (stepType === 'PLANNER_RESPONSE') {
        newMsg = {
          role: 'assistant',
          step_index: step.step_index,
          created_at: step.created_at || new Date().toISOString(),
          thinking: step.thinking || '',
          tool_calls: step.tool_calls || [],
          type: 'planner_response',
        };
      } else if (stepType === 'GENERIC' && source === 'MODEL') {
        newMsg = {
          role: 'assistant',
          step_index: step.step_index,
          created_at: step.created_at || new Date().toISOString(),
          content: step.content || '',
          type: 'assistant_message',
        };
      }

      if (!newMsg) return prev;

      if (existingIdx !== -1) {
        const copy = [...prev];
        copy[existingIdx] = newMsg;
        return copy;
      } else {
        return [...prev, newMsg];
      }
    });

    // Auto-scroll
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  const handleSend = async (overrideText?: string) => {
    const textToSend = (overrideText || inputPrompt).trim();
    if (!textToSend || isSending) return;

    setIsSending(true);
    setInputPrompt('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Otimista: Adicionar mensagem do usuário localmente
    const tempIndex = messages.length ? Math.max(...messages.map((m) => m.step_index)) + 1 : 1;
    const optimisticMsg: Message = {
      role: 'user',
      step_index: tempIndex,
      created_at: new Date().toISOString(),
      content: textToSend,
      type: 'user_message',
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      await api.sendMessage(conversation.id, textToSend);
    } catch (e: any) {
      Alert.alert('Erro ao enviar mensagem', e.message || 'Falha na comunicação com o Antigravity.');
    } finally {
      setIsSending(false);
    }
  };

  const toggleThought = (idx: number) => {
    Haptics.selectionAsync();
    setExpandedThoughts((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const copyToClipboard = (text: string, idx: number) => {
    Clipboard.setString(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {/* Cabeçalho */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <ArrowLeft size={22} color="#f8fafc" />
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

      {/* Lista de Mensagens */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => `${item.step_index}-${item.type}-${index}`}
        contentContainerStyle={styles.messagesList}
        renderItem={({ item, index }) => {
          if (item.type === 'user_message') {
            return (
              <View style={styles.userBubble}>
                <Text style={styles.userText}>{item.content}</Text>
              </View>
            );
          }

          if (item.type === 'planner_response') {
            const isExpanded = !!expandedThoughts[index];
            const hasTools = item.tool_calls && item.tool_calls.length > 0;
            return (
              <View style={styles.plannerCard}>
                {item.thinking ? (
                  <TouchableOpacity
                    style={styles.thoughtHeader}
                    onPress={() => toggleThought(index)}
                    activeOpacity={0.7}
                  >
                    <Sparkles size={14} color="#38bdf8" style={{ marginRight: 6 }} />
                    <Text style={styles.thoughtTitle}>
                      {isExpanded ? 'Raciocínio Interno (Ocultar)' : 'Pensamento do Agente (Ver)'}
                    </Text>
                    {isExpanded ? (
                      <ChevronDown size={14} color="#94a3b8" />
                    ) : (
                      <ChevronRight size={14} color="#94a3b8" />
                    )}
                  </TouchableOpacity>
                ) : null}

                {isExpanded && item.thinking ? (
                  <View style={styles.thoughtBody}>
                    <Text style={styles.thoughtText}>{item.thinking}</Text>
                  </View>
                ) : null}

                {hasTools && (
                  <View style={styles.toolsContainer}>
                    {item.tool_calls!.map((tool: any, tIdx: number) => (
                      <View key={tIdx} style={styles.toolChip}>
                        <Terminal size={12} color="#34d399" style={{ marginRight: 6 }} />
                        <Text style={styles.toolName}>{tool.name}</Text>
                        {tool.args?.toolSummary ? (
                          <Text style={styles.toolSummary} numberOfLines={1}>
                            • {tool.args.toolSummary.replace(/^"|"$/g, '')}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          }

          // Mensagem de resposta do assistente
          return (
            <View style={styles.assistantBubble}>
              <View style={styles.assistantHeader}>
                <View style={styles.assistantAvatar}>
                  <Sparkles size={12} color="#ffffff" />
                </View>
                <Text style={styles.assistantName}>Antigravity</Text>
                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={() => copyToClipboard(item.content || '', index)}
                >
                  {copiedIndex === index ? (
                    <Check size={14} color="#34d399" />
                  ) : (
                    <Copy size={14} color="#64748b" />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.assistantText}>{item.content}</Text>
            </View>
          );
        }}
      />

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

      {/* Input de Envio */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Digite sua mensagem para o Antigravity..."
          placeholderTextColor="#64748b"
          value={inputPrompt}
          onChangeText={setInputPrompt}
          multiline
          maxLength={5000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!inputPrompt.trim() || isSending) && styles.sendBtnDisabled]}
          onPress={() => handleSend()}
          disabled={!inputPrompt.trim() || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Send size={18} color="#ffffff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: '#131d2e',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backBtn: {
    padding: 6,
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
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  headerSubText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '500',
  },
  artifactsBtn: {
    position: 'relative',
    padding: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 8,
    marginLeft: 8,
  },
  artifactsBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#0284c7',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  artifactsBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#0284c7',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    padding: 14,
    maxWidth: '85%',
    marginBottom: 12,
  },
  userText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
  },
  plannerCard: {
    backgroundColor: '#131d2e',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  thoughtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  thoughtTitle: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  thoughtBody: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  thoughtText: {
    color: '#64748b',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
  toolsContainer: {
    marginTop: 6,
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  toolName: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
  },
  toolSummary: {
    color: '#94a3b8',
    fontSize: 11,
    marginLeft: 6,
    flex: 1,
  },
  assistantBubble: {
    backgroundColor: '#131d2e',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 16,
    maxWidth: '92%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  assistantAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  assistantName: {
    flex: 1,
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  copyBtn: {
    padding: 4,
  },
  assistantText: {
    color: '#f8fafc',
    fontSize: 14,
    lineHeight: 22,
  },
  slashCommandsBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#0b0f19',
  },
  slashChip: {
    backgroundColor: '#131d2e',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  slashChipText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#131d2e',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  input: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 120,
    color: '#f8fafc',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendBtnDisabled: {
    backgroundColor: '#334155',
    opacity: 0.5,
  },
});
