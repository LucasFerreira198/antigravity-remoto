import { StorageService } from './storage';

export type StepCallback = (step: any) => void;

export class ConversationWebSocket {
  private ws: WebSocket | null = null;
  private conversationId: string;
  private onStepCallback: StepCallback;
  private isClosedManually: boolean = false;

  constructor(conversationId: string, onStep: StepCallback) {
    this.conversationId = conversationId;
    this.onStepCallback = onStep;
  }

  async connect() {
    const conn = await StorageService.getConnection();
    if (!conn) return;

    const base = conn.server_url.replace(/\/+$/, '');
    const wsProto = base.startsWith('https://') ? 'wss://' : 'ws://';
    const cleanHost = base.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProto}${cleanHost}/api/conversations/${encodeURIComponent(this.conversationId)}/stream?token=${encodeURIComponent(conn.api_key)}`;

    this.isClosedManually = false;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log(`[WS] Conectado ao stream da conversa ${this.conversationId}`);
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.event === 'step') {
          this.onStepCallback(payload.data);
        }
      } catch (e) {
        console.error('[WS] Erro ao processar payload:', e);
      }
    };

    this.ws.onerror = (e) => {
      console.warn('[WS] Erro de conexão:', e);
    };

    this.ws.onclose = () => {
      if (!this.isClosedManually) {
        console.log('[WS] Conexão encerrada. Tentando reconectar em 3s...');
        setTimeout(() => this.connect(), 3000);
      }
    };
  }

  disconnect() {
    this.isClosedManually = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
