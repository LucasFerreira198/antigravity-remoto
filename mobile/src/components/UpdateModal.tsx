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
  Linking,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { DownloadCloud, CheckCircle2, AlertCircle, X, Sparkles, ExternalLink } from 'lucide-react-native';
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
  const [downloadedUri, setDownloadedUri] = useState<string | null>(null);
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
    setDownloadedUri(null);

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

  const triggerInstall = async (fileUri: string) => {
    try {
      const contentUri = await FileSystem.getContentUriAsync(fileUri);
      // FLAG_GRANT_READ_URI_PERMISSION (1) | FLAG_ACTIVITY_NEW_TASK (268435456)
      const flags = 1 | 268435456;
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: flags,
        type: 'application/vnd.android.package-archive',
      });
    } catch (err: any) {
      console.warn('Erro ao disparar action VIEW:', err);
      try {
        const contentUri = await FileSystem.getContentUriAsync(fileUri);
        await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
          data: contentUri,
          flags: 1 | 268435456,
          type: 'application/vnd.android.package-archive',
        });
      } catch (err2: any) {
        Alert.alert(
          'Instalador do Android',
          'O sistema não conseguiu abrir o instalador nativo automaticamente. Deseja abrir o link no navegador para instalar?',
          [
            { text: 'Abrir no Navegador', onPress: () => downloadUrl && Linking.openURL(downloadUrl) },
            { text: 'Cancelar', style: 'cancel' },
          ]
        );
      }
    }
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
    setDownloadedUri(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const targetFile = `${FileSystem.cacheDirectory}AntigravityRemote-update.apk`;

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
      setDownloadedUri(result.uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Disparar o instalador nativo do Android
      await triggerInstall(result.uri);
    } catch (err: any) {
      console.error('Erro ao baixar/instalar atualização:', err);
      Alert.alert(
        'Erro na Instalação',
        `${err.message || 'Não foi possível disparar o instalador'}. Deseja abrir o download pelo navegador?`,
        [
          { text: 'Abrir no Navegador', onPress: () => downloadUrl && Linking.openURL(downloadUrl) },
          { text: 'Fechar', style: 'cancel' }
        ]
      );
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
                O aplicativo será atualizado mantendo todas as suas configurações e conexões.
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
              ) : downloadedUri ? (
                <View style={styles.downloadCompleteBox}>
                  <CheckCircle2 size={36} color="#34d399" style={{ marginBottom: 8 }} />
                  <Text style={styles.downloadCompleteTitle}>APK Baixado com Sucesso!</Text>
                  <Text style={styles.downloadCompleteDesc}>
                    Se o instalador do Android não abrir sozinho, toque no botão abaixo:
                  </Text>
                  <TouchableOpacity
                    style={styles.updateBtn}
                    onPress={() => triggerInstall(downloadedUri)}
                    activeOpacity={0.85}
                  >
                    <DownloadCloud size={20} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.updateBtnText}>Abrir Instalador do Android</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.fallbackBrowserBtn}
                    onPress={() => downloadUrl && Linking.openURL(downloadUrl)}
                  >
                    <ExternalLink size={14} color="#38bdf8" style={{ marginRight: 6 }} />
                    <Text style={styles.fallbackBrowserText}>Instalar via Navegador</Text>
                  </TouchableOpacity>
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
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  congratsDesc: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  downloadBox: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  progressText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#0f172a',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 4,
  },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 14,
    elevation: 3,
  },
  updateBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  downloadCompleteBox: {
    alignItems: 'center',
  },
  downloadCompleteTitle: {
    color: '#34d399',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  downloadCompleteDesc: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  fallbackBrowserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingVertical: 8,
  },
  fallbackBrowserText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
  upToDateTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  upToDateDesc: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 18,
  },
  closeActionBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
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
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  retryBtnText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
});
