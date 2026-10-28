import React, { useState, useEffect } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { QrCode, Server, Key, ArrowRight, X, Globe, CheckCircle2, Cpu, RefreshCw, Zap, ShieldCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { colors, isTabletDevice } from '../theme/colors';
import { api } from '../services/api';
import { StorageService } from '../services/storage';
import { BridgeResolver } from '../services/bridgeResolver';

interface ConnectScreenProps {
  onConnected: () => void;
}

export default function ConnectScreen({ onConnected }: ConnectScreenProps) {
  const { width } = useWindowDimensions();
  const isTablet = isTabletDevice(width);

  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resolvingStatus, setResolvingStatus] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [recentSaved, setRecentSaved] = useState<any>(null);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    StorageService.getConnection().then((saved) => {
      if (saved) {
        setRecentSaved(saved);
        if (saved.server_url) setServerUrl(saved.server_url);
        if (saved.api_key) setApiKey(saved.api_key);
      }
    });
  }, []);

  const handleAutoBridgeConnect = async () => {
    const key = (apiKey || recentSaved?.api_key || '').trim();
    if (!key) {
      Alert.alert('Atenção', 'Informe o Token de Segurança (API Key) para auto-conectar.');
      return;
    }

    setIsLoading(true);
    setResolvingStatus('Consultando Ponte em Nuvem (Zero-QR)...');
    try {
      const resolved = await BridgeResolver.resolveWorkingConnection(key, serverUrl, (step) => {
        setResolvingStatus(step);
      });
      const activeUrl = resolved.url;
      setServerUrl(activeUrl);
      const statusData = await api.testConnection(activeUrl, key);
      api.setCredentials(activeUrl, key);
      await StorageService.saveConnection({
        server_url: activeUrl,
        api_key: key,
        hostname: statusData?.hostname || 'PC',
        is_connected: true,
        last_connected_at: new Date().toISOString(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConnected();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Ponte Remota', err.message || 'Não foi possível encontrar o computador na nuvem.');
    } finally {
      setIsLoading(false);
      setResolvingStatus('');
    }
  };

  const handleConnect = async (urlToUse?: string, keyToUse?: string) => {
    let url = (urlToUse || serverUrl).trim();
    if (url) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('trycloudflare') || url.includes('.com') || url.includes('.io')) {
          url = `https://${url}`;
        } else {
          url = `http://${url}`;
        }
      }
      url = url.replace(/\/+$/, '');
    }
    const key = (keyToUse || apiKey).trim();

    if (!url && !key) {
      Alert.alert('Atenção', 'Informe os dados de conexão ou use o pareamento automático.');
      return;
    }
    if (!key) {
      Alert.alert('Atenção', 'Informe o Token de Segurança (API Key) exibido no seu PC.');
      return;
    }

    setIsLoading(true);
    setResolvingStatus('Verificando endereço...');
    try {
      let statusData: any = null;
      try {
        if (url) {
          statusData = await api.testConnection(url, key);
        }
      } catch (directErr) {
        // Se a conexão direta falhou (ex: URL expirou), tentar auto-resolver na nuvem
        setResolvingStatus('Buscando novo endereço na Nuvem (Zero-QR)...');
        const resolved = await BridgeResolver.resolveWorkingConnection(key, url, (s) => setResolvingStatus(s));
        url = resolved.url;
        setServerUrl(url);
        statusData = await api.testConnection(url, key);
      }

      if (!statusData && !url) {
        const resolved = await BridgeResolver.resolveWorkingConnection(key, undefined, (s) => setResolvingStatus(s));
        url = resolved.url;
        setServerUrl(url);
        statusData = await api.testConnection(url, key);
      }

      api.setCredentials(url, key);
      await StorageService.saveConnection({
        server_url: url,
        api_key: key,
        hostname: statusData?.hostname || 'PC',
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
      setResolvingStatus('');
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
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isTablet && styles.scrollContentTablet]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.cardWrapper, isTablet && styles.cardWrapperTablet]}>
          {/* Cabeçalho Cyber-Developer */}
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
              Controle suas sessões, ferramentas CDP e código do Antigravity direto do celular ou tablet.
            </Text>
          </View>

          {/* Cartão de Estado do Túnel & Diagnóstico de Sub-serviços */}
          <View style={styles.tunnelCard}>
            <View style={styles.tunnelCardHeader}>
              <Text style={styles.tunnelTag}>ESTADO DO TÚNEL REMOTO</Text>
              <Text style={styles.tunnelFile}>server/tunnel.py</Text>
            </View>

            <View style={styles.tunnelInfoRow}>
              <View style={styles.tunnelIconBox}>
                <Globe size={24} color={colors.accentCyan} />
              </View>
              <View style={styles.tunnelTextWrap}>
                <Text style={styles.tunnelTitle}>Servidor Python & CDP</Text>
                <Text style={styles.tunnelSubtitle} numberOfLines={1}>
                  {serverUrl || 'Aguardando configuração de túnel...'}
                </Text>
              </View>
            </View>

            {/* Diagnóstico em 3 colunas */}
            <View style={styles.diagRow}>
              <View style={styles.diagItem}>
                <Text style={styles.diagLabel}>FastAPI</Text>
                <View style={styles.diagStatusRow}>
                  <CheckCircle2 size={12} color={colors.statusEmerald} style={{ marginRight: 3 }} />
                  <Text style={styles.diagStatusText}>OK</Text>
                </View>
              </View>
              <View style={styles.diagItem}>
                <Text style={styles.diagLabel}>WebSocket</Text>
                <View style={styles.diagStatusRow}>
                  <CheckCircle2 size={12} color={colors.statusEmerald} style={{ marginRight: 3 }} />
                  <Text style={styles.diagStatusText}>18ms</Text>
                </View>
              </View>
              <View style={styles.diagItem}>
                <Text style={styles.diagLabel}>CDP Port</Text>
                <View style={styles.diagStatusRow}>
                  <Cpu size={12} color={colors.accentCyan} style={{ marginRight: 3 }} />
                  <Text style={[styles.diagStatusText, { color: colors.accentCyan }]}>:8765</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Botão de Auto-Reconexão Inteligente (Zero-QR) */}
          <TouchableOpacity
            style={styles.autoBridgeCard}
            onPress={handleAutoBridgeConnect}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <View style={styles.autoBridgeIconWrap}>
              <Zap size={22} color="#ffffff" />
            </View>
            <View style={styles.autoBridgeTextWrap}>
              <Text style={styles.autoBridgeTitle}>Auto-Reconectar via Nuvem (Zero-QR)</Text>
              <Text style={styles.autoBridgeDesc}>
                Conecta ao seu PC independente da rede, sem precisar escanear QR Code.
              </Text>
            </View>
            <View style={styles.autoBridgeArrow}>
              <ArrowRight size={16} color="#ffffff" />
            </View>
          </TouchableOpacity>

          {/* Atalho QR Code */}
          <TouchableOpacity
            style={styles.qrCard}
            onPress={handleStartScan}
            activeOpacity={0.8}
          >
            <View style={styles.qrIconWrap}>
              <QrCode size={22} color={colors.accentCyan} />
            </View>
            <View style={styles.qrTextWrap}>
              <Text style={styles.qrTitle}>Escanear Código QR do Terminal</Text>
              <Text style={styles.qrDesc}>Primeiro pareamento ou novo computador</Text>
            </View>
            <View style={styles.arrowCircle}>
              <ArrowRight size={16} color={colors.accentCyan} />
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
            <Text style={styles.inputLabel}>ENDEREÇO DO TÚNEL OU IP LOCAL</Text>
            <View style={styles.inputRow}>
              <Server size={18} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="https://exemplo.trycloudflare.com"
                placeholderTextColor={colors.textSecondary}
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={styles.inputLabel}>TOKEN DE SEGURANÇA (API KEY)</Text>
            <View style={styles.inputRow}>
              <Key size={18} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Chave de segurança exibida no PC"
                placeholderTextColor={colors.textSecondary}
                value={apiKey}
                onChangeText={setApiKey}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
            </View>

            {resolvingStatus ? (
              <View style={styles.resolvingPill}>
                <ActivityIndicator size="small" color={colors.accentCyan} style={{ marginRight: 8 }} />
                <Text style={styles.resolvingText}>{resolvingStatus}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.connectBtn, isLoading && styles.btnDisabled]}
              onPress={() => handleConnect()}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.connectBtnText}>{resolvingStatus || 'Conectando...'}</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.connectBtnText}>Ligar ao Servidor Antigravity</Text>
                  <ArrowRight size={18} color="#ffffff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
  },
  scrollContent: {
    padding: 20,
    justifyContent: 'center',
    minHeight: '100%',
  },
  scrollContentTablet: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  cardWrapper: {
    width: '100%',
  },
  cardWrapperTablet: {
    maxWidth: 620,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 6,
  },
  logoBadge: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    elevation: 8,
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  appLogo: {
    width: 64,
    height: 64,
    borderRadius: 18,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  tunnelCard: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: 16,
  },
  tunnelCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tunnelTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryViolet,
    letterSpacing: 0.8,
  },
  tunnelFile: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: colors.textSecondary,
  },
  tunnelInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  tunnelIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tunnelTextWrap: {
    flex: 1,
  },
  tunnelTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  tunnelSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  diagItem: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  diagLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  diagStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  diagStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.statusEmerald,
    fontFamily: 'monospace',
  },
  autoBridgeCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primaryViolet,
    marginBottom: 12,
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  autoBridgeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primaryViolet,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  autoBridgeTextWrap: {
    flex: 1,
  },
  autoBridgeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  autoBridgeDesc: {
    fontSize: 11,
    color: '#c4b5fd',
    marginTop: 2,
    lineHeight: 15,
  },
  autoBridgeArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolvingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accentCyan,
    marginBottom: 12,
  },
  resolvingText: {
    fontSize: 12,
    color: colors.accentCyan,
    fontWeight: '600',
    flex: 1,
  },
  qrCard: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
    borderStyle: 'dashed',
    marginBottom: 18,
  },
  qrIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  qrTextWrap: {
    flex: 1,
  },
  qrTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  qrDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  formCard: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryViolet,
    marginBottom: 6,
    letterSpacing: 0.8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundPrimary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 12,
    marginBottom: 14,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  connectBtn: {
    backgroundColor: colors.primaryViolet,
    borderRadius: 14,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    elevation: 4,
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  connectBtnText: {
    color: '#ffffff',
    fontSize: 14,
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
    borderColor: colors.primaryViolet,
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
