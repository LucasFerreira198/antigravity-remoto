import { StorageService } from './storage';

export type StepCallback = (payload: any) => void;

export class ConversationWebSocket {
  private ws: WebSocket | null = null;
  private conversationId: string;
  private onStepCallback: StepCallback;
  private isClosedManually: boolean = false;
  private pingInterval: any = null;

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
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          } catch (e) {}
        }
      }, 15000);
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'pong') return;
        this.onStepCallback(payload);
      } catch (e) {
        console.error('[WS] Erro ao processar payload:', e);
      }
    };

    this.ws.onerror = (e) => {
      console.warn('[WS] Erro de conexão:', e);
    };

    this.ws.onclose = () => {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      if (!this.isClosedManually) {
        console.log('[WS] Conexão encerrada. Tentando reconectar em 2s...');
        setTimeout(() => this.connect(), 2000);
      }
    };
  }

  disconnect() {
    this.isClosedManually = true;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
