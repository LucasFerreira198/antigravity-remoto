import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { StorageService } from './src/services/storage';
import { api } from './src/services/api';
import { Conversation } from './src/types';

import ConnectScreen from './src/screens/ConnectScreen';
import ConversationsScreen from './src/screens/ConversationsScreen';
import ChatScreen from './src/screens/ChatScreen';
import ProjectsScreen from './src/screens/ProjectsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import NewConversationModal from './src/screens/NewConversationModal';
import ArtifactViewerModal from './src/screens/ArtifactViewerModal';
import Header from './src/components/Header';

type Screen = 'conversations' | 'chat' | 'projects' | 'settings';

export default function App() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>('conversations');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newConvoModalVisible, setNewConvoModalVisible] = useState(false);
  const [artifactModalData, setArtifactModalData] = useState<{ visible: boolean; conversationId: string }>({
    visible: false,
    conversationId: '',
  });

  // Verificar credenciais salvas no início
  useEffect(() => {
    checkInitialConnection();
  }, []);

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

            {currentScreen === 'settings' && (
              <SettingsScreen
                onBack={() => setCurrentScreen('conversations')}
                onDisconnect={() => {
                  setIsConnected(false);
                  setCurrentScreen('conversations');
                }}
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

            {/* Modal de Visualização de Artefatos */}
            <ArtifactViewerModal
              visible={artifactModalData.visible}
              conversationId={artifactModalData.conversationId}
              onClose={() => setArtifactModalData({ visible: false, conversationId: '' })}
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
    backgroundColor: '#0b0f19',
  },
  splash: {
    flex: 1,
    backgroundColor: '#0b0f19',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainContent: {
    flex: 1,
  },
});
