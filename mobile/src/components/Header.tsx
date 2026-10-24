import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';
import { Sliders, Folder, Sparkles } from 'lucide-react-native';
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
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <View>
            <View style={styles.titleRow}>
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
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onOpenProjects();
          }}
        >
          <Folder size={17} color="#38bdf8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { marginLeft: 8 }]}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onOpenSettings();
          }}
        >
          <Sliders size={17} color="#94a3b8" />
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
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#0d1322',
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
  logoImage: {
    width: 34,
    height: 34,
    borderRadius: 8,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.25)',
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34d399',
    marginRight: 5,
  },
  badgeText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '700',
  },
  subtext: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 1,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#131d2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
});
