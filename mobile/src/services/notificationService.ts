import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configuração do comportamento da notificação quando o app está aberto ou em background
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

class NotificationService {
  private initialized = false;

  async init(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('antigravity_tasks', {
          name: 'Tarefas do Antigravity',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#38bdf8',
          sound: 'default',
          enableVibrate: true,
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      this.initialized = finalStatus === 'granted';
      return this.initialized;
    } catch (e) {
      console.warn('Erro ao inicializar serviço de notificações:', e);
      return false;
    }
  }

  async notifyTaskCompleted(conversationTitle: string, conversationId: string) {
    try {
      await this.init();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '✨ Antigravity: Tarefa Concluída!',
          body: `A tarefa em "${conversationTitle || 'Conversa'}" foi finalizada pelo agente.`,
          data: { conversationId, type: 'task_completed' },
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Imediato
      });
    } catch (e) {
      console.warn('Erro ao disparar notificação de tarefa concluída:', e);
    }
  }

  async notifyQuestionAsked(conversationTitle: string, conversationId: string, question: string) {
    try {
      await this.init();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '❓ Antigravity: Pergunta Aguardando',
          body: `O agente perguntou: "${question}" em "${conversationTitle || 'Conversa'}".`,
          data: { conversationId, type: 'question_asked' },
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      });
    } catch (e) {
      console.warn('Erro ao disparar notificação de pergunta:', e);
    }
  }

  async notifyPlanReady(conversationTitle: string, conversationId: string) {
    try {
      await this.init();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '📋 Antigravity: Plano Pronto para Execução',
          body: `Um plano foi gerado na conversa "${conversationTitle || 'Conversa'}". Toque para revisar e dar Proceed.`,
          data: { conversationId, type: 'plan_ready' },
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      });
    } catch (e) {
      console.warn('Erro ao disparar notificação de plano:', e);
    }
  }
}

export const notificationService = new NotificationService();
