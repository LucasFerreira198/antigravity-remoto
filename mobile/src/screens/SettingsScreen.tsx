import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  Image,
  useWindowDimensions,
} from 'react-native';
import {
  ArrowLeft,
  Sliders,
  Shield,
  Cpu,
  Layers,
  FileCheck,
  Check,
  LogOut,
  Moon,
  DownloadCloud,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { colors, isTabletDevice } from '../theme/colors';
import { api } from '../services/api';
import { StorageService } from '../services/storage';
import { AntigravitySettings } from '../types';
import UpdateModal, { CURRENT_VERSION } from '../components/UpdateModal';

interface SettingsScreenProps {
  onBack: () => void;
  onDisconnect: () => void;
}

export default function SettingsScreen({ onBack, onDisconnect }: SettingsScreenProps) {
  const { width } = useWindowDimensions();
  const isTablet = isTabletDevice(width);
  const [settings, setSettings] = useState<AntigravitySettings>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [updateModalVisible, setUpdateModalVisible] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (e) {
      console.error('Erro ao carregar configurações:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.updateSettings(settings);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sucesso', 'Configurações do Antigravity atualizadas no seu PC!');
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e.message || 'Falha ao sincronizar com o computador.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Desconectar',
      'Deseja realmente desvincular este celular do computador?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: async () => {
            await StorageService.clearConnection();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            onDisconnect();
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accentCyan} />
        <Text style={styles.loadingText}>Carregando configurações...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <ArrowLeft size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerTitle}>Configurações</Text>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Check size={18} color="#ffffff" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={isTablet ? styles.mainWrapperTablet : { width: '100%' }}>
          {/* Execução de Comandos */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Sliders size={16} color={colors.accentCyan} style={{ marginRight: 8 }} />
              <Text style={styles.sectionTitle}>POLÍTICA DE EXECUÇÃO DE FERRAMENTAS</Text>
            </View>
            {[
              { id: 'CASCADE_COMMANDS_AUTO_EXECUTION_EAGER', label: 'Eager (Execução Automática Ágil)' },
              { id: 'CASCADE_COMMANDS_AUTO_EXECUTION_REVIEW', label: 'Solicitar Aprovação para Comandos' },
              { id: 'CASCADE_COMMANDS_AUTO_EXECUTION_STRICT', label: 'Rígido (Confirmação Estrita)' },
            ].map((opt) => {
              const isSelected = settings.autoExecutionPolicy === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.optionRow, isSelected && styles.optionRowActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSettings({ ...settings, autoExecutionPolicy: opt.id });
                  }}
                >
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                    {opt.label}
                  </Text>
                  {isSelected && <Check size={16} color={colors.accentCyan} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Sandbox de Terminal */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Shield size={16} color={colors.primaryViolet} style={{ marginRight: 8 }} />
              <Text style={[styles.sectionTitle, { color: colors.primaryViolet }]}>SANDBOX DE SEGURANÇA</Text>
            </View>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.toggleTitle}>Terminal Sandbox</Text>
                <Text style={styles.toggleDesc}>
                  Executa comandos do agente dentro de um ambiente isolado de terminal no PC.
                </Text>
              </View>
              <Switch
                value={!!settings.enableTerminalSandbox}
                onValueChange={(val) => {
                  Haptics.selectionAsync();
                  setSettings({ ...settings, enableTerminalSandbox: val });
                }}
                trackColor={{ false: colors.borderSubtle, true: colors.primaryViolet }}
                thumbColor={settings.enableTerminalSandbox ? '#c4b5fd' : colors.textMuted}
              />
            </View>
          </View>

          {/* Revisão de Artefatos */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FileCheck size={16} color={colors.statusEmerald} style={{ marginRight: 8 }} />
              <Text style={[styles.sectionTitle, { color: colors.statusEmerald }]}>MODO DE REVISÃO DE ARTEFATOS</Text>
            </View>
            {[
              { id: 'ARTIFACT_REVIEW_MODE_TURBO', label: 'Turbo (Prosseguir Direto)' },
              { id: 'ARTIFACT_REVIEW_MODE_AGENT_DECIDES', label: 'Agente Decide Quando Pedir Revisão' },
              { id: 'ARTIFACT_REVIEW_MODE_ALWAYS_ASK', label: 'Sempre Pedir Aprovação do Plano' },
            ].map((opt) => {
              const isSelected = settings.artifactReviewMode === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.optionRow, isSelected && styles.optionRowActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSettings({ ...settings, artifactReviewMode: opt.id });
                  }}
                >
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                    {opt.label}
                  </Text>
                  {isSelected && <Check size={16} color={colors.statusEmerald} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Acesso a Arquivos Fora do Workspace */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Layers size={16} color={colors.statusAmber} style={{ marginRight: 8 }} />
              <Text style={[styles.sectionTitle, { color: colors.statusAmber }]}>ACESSO A ARQUIVOS EXTERNOS</Text>
            </View>
            {[
              { id: 'AGENT_SETTING_POLICY_ALLOW', label: 'Permitir Acesso Fora do Workspace' },
              { id: 'AGENT_SETTING_POLICY_ASK', label: 'Perguntar Antes de Ler/Gravar Fora' },
              { id: 'AGENT_SETTING_POLICY_DENY', label: 'Bloquear Arquivos Fora do Workspace' },
            ].map((opt) => {
              const isSelected = settings.nonWorkspaceFileAccessPolicy === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.optionRow, isSelected && styles.optionRowActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSettings({ ...settings, nonWorkspaceFileAccessPolicy: opt.id });
                  }}
                >
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                    {opt.label}
                  </Text>
                  {isSelected && <Check size={16} color={colors.statusAmber} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Atualização do App */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <DownloadCloud size={16} color={colors.accentCyan} style={{ marginRight: 8 }} />
              <Text style={styles.sectionTitle}>ATUALIZAÇÃO DO APLICATIVO</Text>
            </View>
            <View style={styles.updateRow}>
              <View>
                <Text style={styles.updateVersionTitle}>Versão Instalada</Text>
                <Text style={styles.updateVersionSubtitle}>v{CURRENT_VERSION}</Text>
              </View>
              <TouchableOpacity
                style={styles.updateCheckBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setUpdateModalVisible(true);
                }}
              >
                <DownloadCloud size={16} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.updateCheckBtnText}>Verificar</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Desconectar */}
          <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
            <LogOut size={18} color={colors.statusRose} style={{ marginRight: 8 }} />
            <Text style={styles.disconnectBtnText}>Desconectar deste Computador</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modal de Atualização Automática */}
      <UpdateModal
        visible={updateModalVisible}
        onClose={() => setUpdateModalVisible(false)}
        manualTrigger={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: colors.backgroundElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.backgroundSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    width: 24,
    height: 24,
    borderRadius: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  saveBtn: {
    width: 40,
    height: 40,
    backgroundColor: colors.primaryViolet,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryViolet,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  scroll: {
    padding: 16,
    paddingBottom: 120,
  },
  mainWrapperTablet: {
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },
  section: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.accentCyan,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: colors.backgroundSurface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  optionRowActive: {
    borderColor: colors.accentCyan,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
  },
  optionLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  optionLabelActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  toggleTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  updateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  updateVersionTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  updateVersionSubtitle: {
    color: colors.accentCyan,
    fontSize: 12,
    marginTop: 2,
    fontWeight: '700',
  },
  updateCheckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryViolet,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  updateCheckBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
  },
  disconnectBtnText: {
    color: colors.statusRose,
    fontSize: 14,
    fontWeight: '700',
  },
});
