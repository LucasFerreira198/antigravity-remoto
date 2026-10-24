import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConnectionConfig } from '../types';

const STORAGE_KEYS = {
  CONNECTION_CONFIG: '@antigravity_remote:connection',
  RECENT_CONNECTIONS: '@antigravity_remote:recent_hosts',
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
  }
};
