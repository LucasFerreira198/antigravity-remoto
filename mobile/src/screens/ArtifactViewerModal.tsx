import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Clipboard,
  Platform,
} from 'react-native';
import { X, FileText, Copy, Check, ArrowLeft, Image as ImageIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { api } from '../services/api';
import { Artifact } from '../types';

interface ArtifactViewerModalProps {
  visible: boolean;
  conversationId: string;
  onClose: () => void;
}

export default function ArtifactViewerModal({
  visible,
  conversationId,
  onClose,
}: ArtifactViewerModalProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [contentData, setContentData] = useState<any>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (visible && conversationId) {
      loadArtifacts();
    }
  }, [visible, conversationId]);

  const loadArtifacts = async () => {
    setIsLoadingList(true);
    setSelectedArtifact(null);
    setContentData(null);
    try {
      const data = await api.getConversation(conversationId);
      setArtifacts(data.artifacts || []);
    } catch (e) {
      console.error('Erro ao carregar artefatos:', e);
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleSelectArtifact = async (art: Artifact) => {
    setSelectedArtifact(art);
    setIsLoadingContent(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const data = await api.getArtifact(conversationId, art.name);
      setContentData(data);
    } catch (e) {
      console.error('Erro ao obter conteúdo do artefato:', e);
    } finally {
      setIsLoadingContent(false);
    }
  };

  const copyContent = () => {
    if (contentData?.content) {
      Clipboard.setString(contentData.content);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            {selectedArtifact ? (
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => {
                  setSelectedArtifact(null);
                  setContentData(null);
                }}
              >
                <ArrowLeft size={20} color="#f8fafc" />
              </TouchableOpacity>
            ) : null}
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {selectedArtifact ? selectedArtifact.name : 'Artefatos da Conversa'}
              </Text>
            </View>
            {selectedArtifact && !contentData?.is_binary ? (
              <TouchableOpacity style={styles.actionBtn} onPress={copyContent}>
                {copied ? <Check size={18} color="#34d399" /> : <Copy size={18} color="#94a3b8" />}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onClose} style={styles.actionBtn}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Conteúdo */}
          {isLoadingList ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.loadingText}>Carregando artefatos...</Text>
            </View>
          ) : selectedArtifact ? (
            isLoadingContent ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color="#38bdf8" />
                <Text style={styles.loadingText}>Abrindo arquivo...</Text>
              </View>
            ) : contentData?.is_binary ? (
              <ScrollView contentContainerStyle={styles.imageScroll}>
                <Image
                  source={{ uri: `data:image/png;base64,${contentData.base64_data}` }}
                  style={styles.artifactImage}
                  resizeMode="contain"
                />
              </ScrollView>
            ) : (
              <ScrollView contentContainerStyle={styles.textScroll}>
                <Text style={styles.artifactText}>{contentData?.content}</Text>
              </ScrollView>
            )
          ) : (
            <ScrollView contentContainerStyle={styles.listScroll}>
              {artifacts.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <FileText size={40} color="#334155" />
                  <Text style={styles.emptyTitle}>Nenhum artefato criado ainda</Text>
                  <Text style={styles.emptyDesc}>
                    Planos, relatórios e imagens criados pelo Antigravity aparecerão aqui.
                  </Text>
                </View>
              ) : (
                artifacts.map((art) => (
                  <TouchableOpacity
                    key={art.name}
                    style={styles.artifactCard}
                    onPress={() => handleSelectArtifact(art)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.iconWrap}>
                      {art.is_image ? (
                        <ImageIcon size={22} color="#38bdf8" />
                      ) : (
                        <FileText size={22} color="#38bdf8" />
                      )}
                    </View>
                    <View style={styles.infoWrap}>
                      <Text style={styles.artName} numberOfLines={1}>
                        {art.name}
                      </Text>
                      {art.summary ? (
                        <Text style={styles.artSummary} numberOfLines={2}>
                          {art.summary}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#131d2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    height: '85%',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  actionBtn: {
    padding: 6,
    marginLeft: 6,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 10,
    fontSize: 13,
  },
  listScroll: {
    paddingBottom: 24,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyDesc: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  artifactCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoWrap: {
    flex: 1,
  },
  artName: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  artSummary: {
    color: '#94a3b8',
    fontSize: 12,
  },
  textScroll: {
    padding: 12,
    paddingBottom: 40,
  },
  artifactText: {
    color: '#f8fafc',
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  imageScroll: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  artifactImage: {
    width: '100%',
    height: 350,
  },
});
