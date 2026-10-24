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
import { api } from '../services/api';
import { StorageService } from '../services/storage';
import { AntigravitySettings } from '../types';
import UpdateModal, { CURRENT_VERSION } from '../components/UpdateModal';

interface SettingsScreenProps {
  onBack: () => void;
  onDisconnect: () => void;
}

export default function SettingsScreen({ onBack, onDisconnect }: SettingsScreenProps) {
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
        <ActivityIndicator size="large" color="#38bdf8" />
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
            <ArrowLeft size={22} color="#f8fafc" />
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
        {/* Execução de Comandos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Sliders size={16} color="#38bdf8" style={{ marginRight: 8 }} />
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
                {isSelected && <Check size={16} color="#38bdf8" />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Sandbox de Terminal */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Shield size={16} color="#38bdf8" style={{ marginRight: 8 }} />
            <Text style={styles.sectionTitle}>SANDBOX DE SEGURANÇA</Text>
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
              trackColor={{ false: '#334155', true: '#0284c7' }}
              thumbColor={settings.enableTerminalSandbox ? '#38bdf8' : '#94a3b8'}
            />
          </View>
        </View>

        {/* Revisão de Artefatos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FileCheck size={16} color="#38bdf8" style={{ marginRight: 8 }} />
            <Text style={styles.sectionTitle}>MODO DE REVISÃO DE ARTEFATOS</Text>
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
                {isSelected && <Check size={16} color="#38bdf8" />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Acesso a Arquivos Fora do Workspace */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Layers size={16} color="#38bdf8" style={{ marginRight: 8 }} />
            <Text style={styles.sectionTitle}>ACESSO A ARQUIVOS EXTERNOS</Text>
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
                {isSelected && <Check size={16} color="#38bdf8" />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Atualização do App */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <DownloadCloud size={16} color="#38bdf8" style={{ marginRight: 8 }} />
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
          <LogOut size={18} color="#ef4444" style={{ marginRight: 8 }} />
          <Text style={styles.disconnectBtnText}>Desconectar deste Computador</Text>
        </TouchableOpacity>
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
    backgroundColor: '#0b0f19',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0b0f19',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: '#131d2e',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backBtn: {
    padding: 6,
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
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '700',
  },
  saveBtn: {
    padding: 8,
    backgroundColor: '#0284c7',
    borderRadius: 8,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: '#131d2e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#38bdf8',
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
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  optionRowActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
  },
  optionLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  optionLabelActive: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  toggleTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleDesc: {
    color: '#64748b',
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
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  updateVersionSubtitle: {
    color: '#38bdf8',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '700',
  },
  updateCheckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
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
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  disconnectBtnText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
  },
});
