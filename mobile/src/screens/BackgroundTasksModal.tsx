import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { X, Terminal, Square, RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { api } from '../services/api';
import { BackgroundTask } from '../types';

interface BackgroundTasksModalProps {
  visible: boolean;
  conversationId: string;
  onClose: () => void;
}

export default function BackgroundTasksModal({
  visible,
  conversationId,
  onClose,
}: BackgroundTasksModalProps) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<BackgroundTask | null>(null);
  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null);

  useEffect(() => {
    let interval: any;
    if (visible && conversationId) {
      loadTasks();
      interval = setInterval(loadTasksSilently, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [visible, conversationId]);

  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const data = await api.getBackgroundTasks(conversationId);
      setTasks(data);
      if (data.length > 0 && !selectedTask) {
        setSelectedTask(data[0]);
      }
    } catch (e) {
      console.error('Erro ao carregar tarefas em background:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTasksSilently = async () => {
    try {
      const data = await api.getBackgroundTasks(conversationId);
      setTasks(data);
      if (selectedTask) {
        const fresh = data.find((t) => t.task_id === selectedTask.task_id);
        if (fresh) setSelectedTask(fresh);
      }
    } catch (e) {}
  };

  const handleStopTask = async (taskId: string) => {
    setStoppingTaskId(taskId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await api.stopBackgroundTask(conversationId, taskId);
      await loadTasks();
    } catch (e) {
      console.error('Erro ao parar tarefa:', e);
    } finally {
      setStoppingTaskId(null);
    }
  };

  const runningCount = tasks.filter((t) => t.status === 'running').length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <Terminal size={18} color="#38bdf8" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Processos & Tarefas do PC</Text>
                <Text style={styles.headerSub}>
                  {runningCount > 0 ? `⚡ ${runningCount} rodando em segundo plano` : 'Nenhuma tarefa ativa agora'}
                </Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={loadTasks} style={styles.refreshBtn}>
                <RefreshCw size={17} color="#94a3b8" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </View>

          {isLoading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.loadingText}>Inspecionando processos do computador...</Text>
            </View>
          ) : tasks.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Terminal size={42} color="#27272a" />
              <Text style={styles.emptyTitle}>Nenhuma tarefa registrada</Text>
              <Text style={styles.emptyDesc}>
                Comandos longos executados pelo agente (como servidores, builds ou monitoramentos) aparecerão aqui.
              </Text>
            </View>
          ) : (
            <View style={styles.contentContainer}>
              {/* Seletor Horizontal de Tarefas */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.taskTabsScroll}>
                {tasks.map((task) => {
                  const isSelected = selectedTask?.task_id === task.task_id;
                  const isRunning = task.status === 'running';
                  return (
                    <TouchableOpacity
                      key={task.task_id}
                      style={[styles.taskTab, isSelected && styles.taskTabSelected]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedTask(task);
                      }}
                    >
                      <View style={[styles.statusDot, isRunning ? styles.dotRunning : styles.dotCompleted]} />
                      <Text style={[styles.taskTabText, isSelected && styles.taskTabTextSelected]} numberOfLines={1}>
                        {task.task_id}
                      </Text>
                      {isRunning && <Text style={styles.runningBadgePill}>ATIVO</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Detalhes da Tarefa Selecionada */}
              {selectedTask && (
                <View style={styles.taskDetailWrap}>
                  <View style={styles.taskDetailHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.taskCommandText} numberOfLines={2}>
                        {selectedTask.description}
                      </Text>
                      <View style={styles.taskMetaRow}>
                        <View style={styles.metaBadge}>
                          {selectedTask.status === 'running' ? (
                            <Clock size={12} color="#34d399" />
                          ) : (
                            <CheckCircle2 size={12} color="#94a3b8" />
                          )}
                          <Text
                            style={[
                              styles.metaBadgeText,
                              { color: selectedTask.status === 'running' ? '#34d399' : '#94a3b8' },
                            ]}
                          >
                            {selectedTask.status === 'running' ? 'Executando' : 'Finalizado'}
                          </Text>
                        </View>
                        {selectedTask.is_daemon && (
                          <View style={[styles.metaBadge, { backgroundColor: 'rgba(56, 189, 248, 0.12)' }]}>
                            <Text style={[styles.metaBadgeText, { color: '#38bdf8' }]}>Daemon / Servidor</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {selectedTask.status === 'running' && (
                      <TouchableOpacity
                        style={[styles.stopBtn, stoppingTaskId === selectedTask.task_id && styles.stopBtnDisabled]}
                        onPress={() => handleStopTask(selectedTask.task_id)}
                        disabled={stoppingTaskId === selectedTask.task_id}
                      >
                        {stoppingTaskId === selectedTask.task_id ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <>
                            <Square size={14} color="#ffffff" fill="#ffffff" style={{ marginRight: 6 }} />
                            <Text style={styles.stopBtnText}>Parar</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Saída de Log do Terminal */}
                  <View style={styles.logContainer}>
                    <View style={styles.logTopBar}>
                      <Text style={styles.logTopTitle}>Terminal Output (Últimas Linhas)</Text>
                      <Text style={styles.logSizeText}>
                        {selectedTask.log_size ? `${(selectedTask.log_size / 1024).toFixed(1)} KB` : '0 KB'}
                      </Text>
                    </View>
                    <ScrollView style={styles.logScroll} contentContainerStyle={styles.logContent}>
                      <Text style={styles.logText}>
                        {selectedTask.log_tail || '(Nenhuma saída gerada por este processo)'}
                      </Text>
                    </ScrollView>
                  </View>
                </View>
              )}
            </View>
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
    height: '82%',
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshBtn: {
    padding: 8,
    marginRight: 4,
  },
  closeBtn: {
    padding: 8,
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
    marginTop: 14,
  },
  emptyDesc: {
    color: '#71717a',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  contentContainer: {
    flex: 1,
    marginTop: 12,
  },
  taskTabsScroll: {
    maxHeight: 46,
    marginBottom: 12,
  },
  taskTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#141418',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    marginRight: 8,
  },
  taskTabSelected: {
    backgroundColor: '#1f2937',
    borderColor: '#38bdf8',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotRunning: {
    backgroundColor: '#22c55e',
  },
  dotCompleted: {
    backgroundColor: '#71717a',
  },
  taskTabText: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '600',
  },
  taskTabTextSelected: {
    color: '#ffffff',
  },
  runningBadgePill: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    color: '#4ade80',
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  taskDetailWrap: {
    flex: 1,
  },
  taskDetailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: '#141418',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 12,
  },
  taskCommandText: {
    color: '#e4e4e7',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27272a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  metaBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 10,
  },
  stopBtnDisabled: {
    opacity: 0.5,
  },
  stopBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    overflow: 'hidden',
  },
  logTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#18181b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  logTopTitle: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  logSizeText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  logScroll: {
    flex: 1,
    padding: 10,
  },
  logContent: {
    paddingBottom: 20,
  },
  logText: {
    color: '#4ade80',
    fontSize: 11.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 17,
  },
});
