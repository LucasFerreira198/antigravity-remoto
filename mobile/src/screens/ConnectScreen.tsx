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
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { QrCode, Server, Key, ArrowRight, X, Sparkles } from 'lucide-react-native';
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
          facing="back"
          onBarcodeScanned={handleBarcodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
        />
        <View style={styles.cameraOverlay}>
          <View style={styles.cameraHeader}>
            <Text style={styles.cameraTitle}>Escanear QR Code no PC</Text>
            <TouchableOpacity style={styles.closeCameraBtn} onPress={() => setIsScanning(false)}>
              <X size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
          <View style={styles.scanTarget}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.cameraHint}>
            Aponte para o QR Code gerado pelo comando "start-remote.bat" no terminal do seu computador.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Cabeçalho com Logo Oficial */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.appLogo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>Antigravity Remoto</Text>
          <Text style={styles.subtitle}>
            Controle suas conversas e projetos do Antigravity direto do celular de qualquer lugar do mundo.
          </Text>
        </View>

        {/* Atalho QR Code */}
        <TouchableOpacity
          style={styles.qrCard}
          onPress={handleStartScan}
          activeOpacity={0.8}
        >
          <View style={styles.qrIconWrap}>
            <QrCode size={26} color="#38bdf8" />
          </View>
          <View style={styles.qrTextWrap}>
            <Text style={styles.qrTitle}>Conectar via QR Code</Text>
            <Text style={styles.qrDesc}>Escaneie o código do terminal do PC com a câmera</Text>
          </View>
          <View style={styles.arrowCircle}>
            <ArrowRight size={16} color="#38bdf8" />
          </View>
        </TouchableOpacity>

        {/* Divisor */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OU CONEXÃO MANUAL</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Formulário Manual */}
        <View style={styles.formCard}>
          <Text style={styles.inputLabel}>URL DO SERVIDOR OU TÚNEL</Text>
          <View style={styles.inputRow}>
            <Server size={18} color="#64748b" style={styles.inputIcon} />
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
            <Key size={18} color="#64748b" style={styles.inputIcon} />
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
                <ArrowRight size={18} color="#ffffff" />
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
    backgroundColor: '#09090b',
  },
  scrollContent: {
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 10,
  },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    elevation: 8,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  appLogo: {
    width: 68,
    height: 68,
    borderRadius: 18,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f4f4f5',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#a1a1aa',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  qrCard: {
    backgroundColor: '#121318',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 20,
  },
  qrIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  qrTextWrap: {
    flex: 1,
  },
  qrTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f4f4f5',
  },
  qrDesc: {
    fontSize: 12,
    color: '#71717a',
    marginTop: 2,
  },
  arrowCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#27272a',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 10,
    fontWeight: '700',
    color: '#71717a',
    letterSpacing: 0.8,
  },
  formCard: {
    backgroundColor: '#121318',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38bdf8',
    marginBottom: 6,
    letterSpacing: 0.8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    paddingHorizontal: 12,
    marginBottom: 16,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#f4f4f5',
    fontSize: 14,
  },
  connectBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 14,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    elevation: 4,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  connectBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginRight: 8,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 24,
    paddingTop: 50,
    paddingBottom: 40,
    alignItems: 'center',
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  cameraTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  closeCameraBtn: {
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
  },
  scanTarget: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#38bdf8',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  cameraHint: {
    color: '#ffffff',
    fontSize: 13,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
});
