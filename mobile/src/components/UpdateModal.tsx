import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { DownloadCloud, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import appConfig from '../../app.json';

export const CURRENT_VERSION = appConfig.expo.version || '1.0.1';
const GITHUB_REPO = 'LucasFerreira198/antigravity-remoto';

interface UpdateModalProps {
  visible: boolean;
  onClose: () => void;
  manualTrigger?: boolean;
}

export default function UpdateModal({
  visible,
  onClose,
  manualTrigger = false,
}: UpdateModalProps) {
  const [checking, setChecking] = useState<boolean>(true);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [latestVersion, setLatestVersion] = useState<string>(CURRENT_VERSION);
  const [releaseNotes, setReleaseNotes] = useState<string>('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      checkForUpdates();
    }
  }, [visible]);

  const checkForUpdates = async () => {
    setChecking(true);
    setErrorMsg(null);
    setDownloadProgress(0);
    setIsDownloading(false);

    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AntigravityRemote-App',
        },
      });

      if (!response.ok) {
        throw new Error(`Falha ao verificar atualizações (${response.status})`);
      }

      const data = await response.json();
      const tagName = data.tag_name || '';
      const releaseName = data.name || '';
      const body = data.body || '';

      // Extrair versão semântica
      let remoteVer = '';
      const match = (releaseName + ' ' + tagName).match(/v?(\d+\.\d+\.\d+)/i);
      if (match) {
        remoteVer = match[1];
      }

      // Procurar o asset do APK
      const apkAsset = (data.assets || []).find((a: any) =>
        a.name && a.name.toLowerCase().endsWith('.apk')
      );
      const apkUrl = apkAsset ? apkAsset.browser_download_url : null;

      setLatestVersion(remoteVer || 'Nova Versão');
      setReleaseNotes(body);
      setDownloadUrl(apkUrl);

      // Comparar versões
      if (remoteVer && isNewerVersion(remoteVer, CURRENT_VERSION) && apkUrl) {
        setUpdateAvailable(true);
      } else if (manualTrigger && apkUrl) {
        // Se disparado manualmente, permite reinstalar/atualizar
        setUpdateAvailable(remoteVer !== CURRENT_VERSION);
      } else {
        setUpdateAvailable(false);
      }
    } catch (err: any) {
      console.error('Erro na checagem de update:', err);
      setErrorMsg(err.message || 'Erro ao conectar ao GitHub.');
    } finally {
      setChecking(false);
    }
  };

  const isNewerVersion = (remote: string, current: string): boolean => {
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

  const handleDownloadAndInstall = async () => {
    if (!downloadUrl) {
      Alert.alert('Erro', 'Link do arquivo APK não encontrado na release.');
      return;
    }

    if (Platform.OS !== 'android') {
      Alert.alert('Aviso', 'A instalação automática está disponível apenas para Android.');
      return;
    }

    setIsDownloading(true);
    setDownloadProgress(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const targetFile = `${FileSystem.documentDirectory}AntigravityRemote-update.apk`;

    try {
      // Deletar versão antiga se existir
      const fileInfo = await FileSystem.getInfoAsync(targetFile);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(targetFile, { idempotent: true });
      }

      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        targetFile,
        {},
        (progress) => {
          if (progress.totalBytesExpectedToWrite > 0) {
            const p = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
            setDownloadProgress(Math.min(Math.max(p, 0), 1));
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result || !result.uri) {
        throw new Error('Falha no download do APK.');
      }

      setDownloadProgress(1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Disparar o instalador de pacotes nativo do Android
      const contentUri = await FileSystem.getContentUriAsync(result.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: 'application/vnd.android.package-archive',
      });

      onClose();
    } catch (err: any) {
      console.error('Erro ao baixar/instalar atualização:', err);
      Alert.alert('Erro na Instalação', err.message || 'Não foi possível disparar o instalador do Android.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Sparkles size={20} color="#38bdf8" style={{ marginRight: 8 }} />
              <Text style={styles.title}>Atualização do App</Text>
            </View>
            {!isDownloading && (
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Conteúdo */}
          {checking ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.loadingText}>Verificando novas versões no GitHub...</Text>
            </View>
          ) : errorMsg ? (
            <View style={styles.centerBox}>
              <AlertCircle size={44} color="#ef4444" style={{ marginBottom: 12 }} />
              <Text style={styles.errorTitle}>Não foi possível verificar</Text>
              <Text style={styles.errorDesc}>{errorMsg}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={checkForUpdates}>
                <Text style={styles.retryBtnText}>Tentar Novamente</Text>
              </TouchableOpacity>
            </View>
          ) : updateAvailable ? (
            <View style={styles.contentBox}>
              <View style={styles.versionBadgeRow}>
                <View style={styles.versionPillOld}>
                  <Text style={styles.versionPillOldText}>Atual: v{CURRENT_VERSION}</Text>
                </View>
                <Text style={styles.versionArrow}>→</Text>
                <View style={styles.versionPillNew}>
                  <Text style={styles.versionPillNewText}>Nova: v{latestVersion}</Text>
                </View>
              </View>

              <Text style={styles.congratsTitle}>🚀 Nova Versão Pronta para Instalar!</Text>
              <Text style={styles.congratsDesc}>
                O aplicativo será atualizado automaticamente sem perder nenhuma configuração ou histórico.
              </Text>

              {isDownloading ? (
                <View style={styles.downloadBox}>
                  <Text style={styles.progressText}>
                    Baixando atualização... {Math.round(downloadProgress * 100)}%
                  </Text>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${Math.round(downloadProgress * 100)}%` },
                      ]}
                    />
                  </View>
                  <ActivityIndicator size="small" color="#38bdf8" style={{ marginTop: 10 }} />
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.updateBtn}
                  onPress={handleDownloadAndInstall}
                  activeOpacity={0.85}
                >
                  <DownloadCloud size={20} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.updateBtnText}>Atualizar Agora (1 Toque)</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.centerBox}>
              <CheckCircle2 size={48} color="#34d399" style={{ marginBottom: 12 }} />
              <Text style={styles.upToDateTitle}>Você está na versão mais recente!</Text>
              <Text style={styles.upToDateDesc}>
                Versão v{CURRENT_VERSION} instalada e funcionando perfeitamente.
              </Text>
              <TouchableOpacity style={styles.closeActionBtn} onPress={onClose}>
                <Text style={styles.closeActionBtnText}>Fechar</Text>
              </TouchableOpacity>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#131d2e',
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  contentBox: {
    paddingVertical: 10,
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 14,
  },
  versionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  versionPillOld: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  versionPillOldText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  versionArrow: {
    color: '#64748b',
    fontSize: 16,
    marginHorizontal: 10,
    fontWeight: 'bold',
  },
  versionPillNew: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  versionPillNewText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  congratsTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  congratsDesc: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  downloadBox: {
    marginTop: 10,
    alignItems: 'center',
  },
  progressText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#0f172a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0284c7',
    borderRadius: 4,
  },
  updateBtn: {
    backgroundColor: '#0284c7',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  upToDateTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  upToDateDesc: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  closeActionBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  closeActionBtnText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
  },
  errorTitle: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorDesc: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 14,
  },
  retryBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
});
