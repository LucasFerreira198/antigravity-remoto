import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConnectionConfig, Message, Artifact, Conversation } from '../types';

const STORAGE_KEYS = {
  CONNECTION_CONFIG: '@antigravity_remote:connection',
  RECENT_CONNECTIONS: '@antigravity_remote:recent_hosts',
  CHAT_CACHE_PREFIX: '@antigravity_remote:chat_cache:',
};

export const StorageService = {
  async saveConnection(config: ConnectionConfig): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CONNECTION_CONFIG, JSON.stringify(config));
    } catch (e) {
      console.error('Erro ao salvar conexão:', e);
    }
  },

  async getConnection(): Promise<ConnectionConfig | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.CONNECTION_CONFIG);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Erro ao carregar conexão:', e);
    }
    return null;
  },

  async clearConnection(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.CONNECTION_CONFIG);
    } catch (e) {
      console.error('Erro ao limpar conexão:', e);
    }
  },

  async getChatCache(conversationId: string): Promise<{ messages: Message[]; artifacts: Artifact[] } | null> {
    try {
      const key = `${STORAGE_KEYS.CHAT_CACHE_PREFIX}${conversationId}`;
      const data = await AsyncStorage.getItem(key);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('Erro ao carregar cache do chat:', e);
    }
    return null;
  },

  async saveChatCache(conversationId: string, messages: Message[], artifacts: Artifact[] = []): Promise<void> {
    try {
      const key = `${STORAGE_KEYS.CHAT_CACHE_PREFIX}${conversationId}`;
      // Salvar até as últimas 60 mensagens para manter leitura rápida
      const sliced = messages.slice(-60);
      await AsyncStorage.setItem(key, JSON.stringify({ messages: sliced, artifacts }));
    } catch (e) {
      console.warn('Erro ao salvar cache do chat:', e);
    }
  },

  async getConversationsCache(): Promise<Conversation[] | null> {
    try {
      const data = await AsyncStorage.getItem('@antigravity_remote:convos_cache');
      if (data) return JSON.parse(data);
    } catch (e) {}
    return null;
  },

  async saveConversationsCache(convos: Conversation[]): Promise<void> {
    try {
      await AsyncStorage.setItem('@antigravity_remote:convos_cache', JSON.stringify(convos.slice(0, 60)));
    } catch (e) {}
  }
};
