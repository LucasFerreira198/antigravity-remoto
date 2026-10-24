import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { QrCode, Server, Key, ArrowRight, ShieldCheck, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { api } from '../services/api';
import { StorageService } from '../services/storage';

interface ConnectScreenProps {
  onConnected: () => void;
}

export default function ConnectScreen({ onConnected }: ConnectScreenProps) {
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const handleConnect = async (urlToUse?: string, keyToUse?: string) => {
    const url = (urlToUse || serverUrl).trim();
    const key = (keyToUse || apiKey).trim();

    if (!url) {
      Alert.alert('Atenção', 'Informe a URL do servidor ponte (ex: https://xxx.trycloudflare.com).');
      return;
    }
    if (!key) {
      Alert.alert('Atenção', 'Informe o Token de Segurança (API Key) exibido no seu PC.');
      return;
    }

    setIsLoading(true);
    try {
      const statusData = await api.testConnection(url, key);
      api.setCredentials(url, key);
      await StorageService.saveConnection({
        server_url: url,
        api_key: key,
        hostname: statusData.hostname || 'PC',
        is_connected: true,
        last_connected_at: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConnected();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro de Conexão', err.message || 'Não foi possível conectar ao computador.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartScan = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Permissão Negada', 'É necessário permitir a câmera para ler o QR Code.');
        return;
      }
    }
    setIsScanning(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    setIsScanning(false);
    try {
      const parsed = JSON.parse(data);
      if (parsed.api_key && (parsed.remote_url || parsed.local_url)) {
        const url = parsed.remote_url || parsed.local_url;
        setServerUrl(url);
        setApiKey(parsed.api_key);
        handleConnect(url, parsed.api_key);
        return;
      }
    } catch (e) {
      // Se não for JSON, pode ser diretamente a URL
      if (data.startsWith('http')) {
        setServerUrl(data);
      }
    }
  };

  if (isScanning) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={handleBarcodeScanned}
        />
        <View style={styles.scanOverlay}>
          <TouchableOpacity style={styles.closeScanBtn} onPress={() => setIsScanning(false)}>
            <X size={24} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.scanTarget} />
          <Text style={styles.scanPrompt}>Aponte para o QR Code no terminal do PC</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Cabeçalho */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <ShieldCheck size={36} color="#38bdf8" />
          </View>
          <Text style={styles.title}>Antigravity Remoto</Text>
          <Text style={styles.subtitle}>
            Controle suas conversas, projetos e configurações do Antigravity em qualquer lugar do mundo.
          </Text>
        </View>

        {/* Card de Pareamento por QR Code */}
        <TouchableOpacity style={styles.qrCard} onPress={handleStartScan} activeOpacity={0.8}>
          <View style={styles.qrIconWrap}>
            <QrCode size={28} color="#38bdf8" />
          </View>
          <View style={styles.qrTextWrap}>
            <Text style={styles.qrTitle}>Escanear QR Code no PC</Text>
            <Text style={styles.qrDesc}>Pareamento instantâneo via câmera</Text>
          </View>
          <ArrowRight size={20} color="#94a3b8" />
        </TouchableOpacity>

        <View style={styles.dividerWrap}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OU CONEXÃO MANUAL</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Formulário Manual */}
        <View style={styles.formCard}>
          <Text style={styles.inputLabel}>URL DO SERVIDOR OU TÚNEL</Text>
          <View style={styles.inputRow}>
            <Server size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="https://exemplo.trycloudflare.com"
              placeholderTextColor="#64748b"
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={styles.inputLabel}>TOKEN DE SEGURANÇA (API KEY)</Text>
          <View style={styles.inputRow}>
            <Key size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Chave de segurança exibida no PC"
              placeholderTextColor="#64748b"
              value={apiKey}
              onChangeText={setApiKey}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.connectBtn, isLoading && styles.btnDisabled]}
            onPress={() => handleConnect()}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text style={styles.connectBtnText}>Conectar ao Antigravity</Text>
                <ArrowRight size={20} color="#ffffff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  scrollContent: {
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  qrCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 24,
  },
  qrIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  qrTextWrap: {
    flex: 1,
  },
  qrTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  qrDesc: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  dividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1e293b',
  },
  dividerText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginHorizontal: 12,
  },
  formCard: {
    backgroundColor: '#131d2e',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  inputLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 48,
    color: '#f8fafc',
    fontSize: 14,
  },
  connectBtn: {
    backgroundColor: '#0284c7',
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  connectBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scanOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeScanBtn: {
    position: 'absolute',
    top: 50,
    right: 25,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTarget: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#38bdf8',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  scanPrompt: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 24,
  },
});
