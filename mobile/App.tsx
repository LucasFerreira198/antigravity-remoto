import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, ActivityIndicator, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import { StorageService } from './src/services/storage';
import { api } from './src/services/api';
import { notificationService } from './src/services/notificationService';
import { Conversation } from './src/types';

import ConnectScreen from './src/screens/ConnectScreen';
import ConversationsScreen from './src/screens/ConversationsScreen';
import ChatScreen from './src/screens/ChatScreen';
import ProjectsScreen from './src/screens/ProjectsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import NewConversationModal from './src/screens/NewConversationModal';
import ArtifactViewerModal from './src/screens/ArtifactViewerModal';
import BackgroundTasksModal from './src/screens/BackgroundTasksModal';
import Header from './src/components/Header';
import UpdateModal from './src/components/UpdateModal';
import BottomNavBar, { TabKey } from './src/components/BottomNavBar';
import { colors } from './src/theme/colors';

type Screen = 'conversations' | 'chat' | 'projects' | 'settings' | 'connect';

export default function App() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>('conversations');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newConvoModalVisible, setNewConvoModalVisible] = useState(false);
  const [backgroundTasksModalVisible, setBackgroundTasksModalVisible] = useState(false);
  const [artifactModalData, setArtifactModalData] = useState<{ visible: boolean; conversationId: string }>({
    visible: false,
    conversationId: '',
  });
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const activeConversationsRef = useRef<Record<string, boolean>>({});

  // Inicializar notificações e escutar toques do usuário
  useEffect(() => {
    notificationService.init();

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data && typeof data === 'object' && 'conversationId' in data && (data as any).conversationId) {
        const convoId = String((data as any).conversationId);
        api.getConversation(convoId).then((convo) => {
          if (convo) {
            setSelectedConversation(convo as any);
            setCurrentScreen('chat');
          }
        }).catch(() => {});
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

  // Gerenciamento do botão voltar físico/gesto do Android para não fechar o app
  useEffect(() => {
    const onBackPress = () => {
      if (updateModalVisible) {
        setUpdateModalVisible(false);
        return true;
      }
      if (backgroundTasksModalVisible) {
        setBackgroundTasksModalVisible(false);
        return true;
      }
      if (artifactModalData.visible) {
        setArtifactModalData({ visible: false, conversationId: '' });
        return true;
      }
      if (newConvoModalVisible) {
        setNewConvoModalVisible(false);
        return true;
      }
      if (currentScreen === 'chat') {
        setSelectedConversation(null);
        setCurrentScreen('conversations');
        return true;
      }
      if (currentScreen === 'projects' || currentScreen === 'settings' || currentScreen === 'connect') {
        setCurrentScreen('conversations');
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [currentScreen, updateModalVisible, backgroundTasksModalVisible, artifactModalData.visible, newConvoModalVisible]);

  // Monitor em segundo plano para notificar quando tarefas terminam enquanto o usuário está em outra tela
  useEffect(() => {
    if (!isConnected) return;

    const monitorInterval = setInterval(async () => {
      try {
        const convos = await api.getConversations(25);
        for (const c of convos) {
          const wasActive = activeConversationsRef.current[c.id];
          if (wasActive && !c.is_active) {
            // Se o usuário estiver em outra tela ou em outra conversa, disparar notificação Android
            if (currentScreen !== 'chat' || selectedConversation?.id !== c.id) {
              notificationService.notifyTaskCompleted(c.title, c.id);
            }
          }
          activeConversationsRef.current[c.id] = !!c.is_active;
        }
      } catch (e) {}
    }, 4000);

    return () => clearInterval(monitorInterval);
  }, [isConnected, currentScreen, selectedConversation?.id]);

  // Verificar credenciais salvas no início e checar updates
  useEffect(() => {
    checkInitialConnection();

    // Verificação não-bloqueante de atualizações 2s após inicializar
    const timer = setTimeout(() => {
      checkAppUpdateSilently();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const checkAppUpdateSilently = async () => {
    try {
      const res = await fetch('https://api.github.com/repos/LucasFerreira198/antigravity-remoto/releases/latest', {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AntigravityRemote-App',
        },
      });
      if (res.ok) {
        const data = await res.json();
        const tagName = data.tag_name || '';
        const releaseName = data.name || '';
        const match = (releaseName + ' ' + tagName).match(/v?(\d+\.\d+\.\d+)/i);
        const remoteVer = match ? match[1] : '';
        const currentVer = require('./app.json').expo.version || '1.0.2';
        
        // Se remoto for maior que atual, abrir modal de atualização
        if (remoteVer && isNewer(remoteVer, currentVer)) {
          setUpdateModalVisible(true);
        }
      }
    } catch (e) {
      // Ignorar erros em checagem silenciosa
    }
  };

  const isNewer = (remote: string, current: string): boolean => {
    const rParts = remote.replace(/^v/i, '').split('.').map((p) => parseInt(p, 10) || 0);
    const cParts = current.replace(/^v/i, '').split('.').map((p) => parseInt(p, 10) || 0);
    const maxLen = Math.max(rParts.length, cParts.length);
    for (let i = 0; i < maxLen; i++) {
      const r = rParts[i] || 0;
      const c = cParts[i] || 0;
      if (r > c) return true;
      if (r < c) return false;
    }
    return false;
  };

  const checkInitialConnection = async () => {
    const saved = await StorageService.getConnection();
    if (saved && saved.server_url && saved.api_key) {
      api.setCredentials(saved.server_url, saved.api_key);
      try {
        await api.getStatus();
        setIsConnected(true);
      } catch (e) {
        // Se a URL pública temporária expirou, mantemos os dados mas permitimos re-conectar
        setIsConnected(false);
      }
    } else {
      setIsConnected(false);
    }
  };

  if (isConnected === null) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        {!isConnected ? (
          <ConnectScreen onConnected={() => setIsConnected(true)} />
        ) : (
          <View style={styles.mainContent}>
            {currentScreen === 'conversations' && (
              <>
                <Header
                  onOpenProjects={() => setCurrentScreen('projects')}
                  onOpenSettings={() => setCurrentScreen('settings')}
                  onOpenTasks={() => setBackgroundTasksModalVisible(true)}
                  onOpenConnect={() => setCurrentScreen('connect')}
                />
                <ConversationsScreen
                  onSelectConversation={(convo) => {
                    setSelectedConversation(convo);
                    setCurrentScreen('chat');
                  }}
                  onOpenNewConversation={() => setNewConvoModalVisible(true)}
                  onOpenProjects={() => setCurrentScreen('projects')}
                  onOpenSettings={() => setCurrentScreen('settings')}
                />
              </>
            )}

            {currentScreen === 'chat' && selectedConversation && (
              <ChatScreen
                conversation={selectedConversation}
                onBack={() => {
                  setSelectedConversation(null);
                  setCurrentScreen('conversations');
                }}
                onOpenArtifacts={(convoId) => {
                  setArtifactModalData({ visible: true, conversationId: convoId });
                }}
              />
            )}

            {currentScreen === 'projects' && (
              <ProjectsScreen
                onBack={() => setCurrentScreen('conversations')}
                onSelectProject={(project) => {
                  // Abrir modal de nova conversa pré-selecionando este projeto
                  setCurrentScreen('conversations');
                  setNewConvoModalVisible(true);
                }}
              />
            )}

            {currentScreen === 'connect' && (
              <ConnectScreen onConnected={() => setCurrentScreen('conversations')} />
            )}

            {currentScreen === 'settings' && (
              <SettingsScreen
                onBack={() => setCurrentScreen('conversations')}
                onDisconnect={() => {
                  setIsConnected(false);
                  setCurrentScreen('conversations');
                }}
              />
            )}

            {/* Barra de Navegação Inferior (Oculta apenas dentro do Chat) */}
            {currentScreen !== 'chat' && (
              <BottomNavBar
                currentTab={currentScreen}
                onTabChange={(tab: TabKey) => setCurrentScreen(tab)}
                onNewConversation={() => setNewConvoModalVisible(true)}
              />
            )}

            {/* Modal de Nova Conversa */}
            <NewConversationModal
              visible={newConvoModalVisible}
              onClose={() => setNewConvoModalVisible(false)}
              onCreated={() => {
                // Ao criar, voltar para a lista para exibir a nova conversa
                setCurrentScreen('conversations');
              }}
            />

            {/* Modal de Tarefas em Segundo Plano */}
            <BackgroundTasksModal
              visible={backgroundTasksModalVisible}
              conversationId={selectedConversation?.id}
              onClose={() => setBackgroundTasksModalVisible(false)}
            />

            {/* Modal de Visualização de Artefatos */}
            <ArtifactViewerModal
              visible={artifactModalData.visible}
              conversationId={artifactModalData.conversationId}
              onClose={() => setArtifactModalData({ visible: false, conversationId: '' })}
              onProceedSent={() => {
                if (currentScreen !== 'chat') {
                  api.getConversation(artifactModalData.conversationId).then((convo) => {
                    if (convo) {
                      setSelectedConversation(convo as any);
                      setCurrentScreen('chat');
                    }
                  }).catch(() => {});
                }
              }}
            />

            {/* Modal de Atualização Automática do App */}
            <UpdateModal
              visible={updateModalVisible}
              onClose={() => setUpdateModalVisible(false)}
              manualTrigger={false}
            />
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
  },
  splash: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainContent: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
  },
});
