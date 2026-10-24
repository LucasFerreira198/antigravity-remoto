import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { ShieldCheck, Sliders, Folder, Cpu } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { api } from '../services/api';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenProjects: () => void;
}

export default function Header({ onOpenSettings, onOpenProjects }: HeaderProps) {
  const [statusData, setStatusData] = useState<any>(null);

  useEffect(() => {
    api.getStatus().then((data) => setStatusData(data)).catch(() => {});
    const interval = setInterval(() => {
      api.getStatus().then((data) => setStatusData(data)).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.header}>
      <View style={styles.titleWrap}>
        <View style={styles.logoRow}>
          <ShieldCheck size={20} color="#38bdf8" style={{ marginRight: 6 }} />
          <Text style={styles.title}>Antigravity</Text>
          <View style={styles.badge}>
            <View style={styles.onlineDot} />
            <Text style={styles.badgeText}>{statusData?.hostname || 'Online'}</Text>
          </View>
        </View>
        <Text style={styles.subtext}>
          {statusData?.settings?.model || 'Gemini 3.8 Flash'} • Remoto
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onOpenProjects();
          }}
        >
          <Folder size={18} color="#94a3b8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { marginLeft: 8 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onOpenSettings();
          }}
        >
          <Sliders size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: '#131d2e',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  titleWrap: {
    flex: 1,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34d399',
    marginRight: 4,
  },
  badgeText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '700',
  },
  subtext: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 8,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
});
