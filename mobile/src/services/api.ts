import { Conversation, Message, Artifact, Project, AntigravitySettings, BackgroundTask, TokenStats, Skill, SuggestionItem, ModelInfo } from '../types';
import { StorageService } from './storage';
import { BridgeResolver } from './bridgeResolver';

class ApiService {
  private baseUrl: string = '';
  private apiKey: string = '';
  private isResolvingBridge: boolean = false;

  constructor() {
    this.init();
  }

  async init() {
    const saved = await StorageService.getConnection();
    if (saved) {
      this.baseUrl = saved.server_url.replace(/\/+$/, '');
      this.apiKey = saved.api_key;
    }
  }

  setCredentials(url: string, key: string) {
    this.baseUrl = url.replace(/\/+$/, '');
    this.apiKey = key;
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.baseUrl) {
      const saved = await StorageService.getConnection();
      if (saved) {
        this.baseUrl = saved.server_url.replace(/\/+$/, '');
        this.apiKey = saved.api_key;
      } else {
        throw new Error('Servidor não configurado. Por favor, conecte-se ao seu PC.');
      }
    }

    const makeFetch = async (targetBase: string, timeoutMs: number = 18000) => {
      const url = `${targetBase}${endpoint}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'Authorization': `Bearer ${this.apiKey}`,
        ...(options.headers as Record<string, string> || {})
      };
      try {
        const res = await fetch(url, { ...options, headers, signal: controller.signal });
        clearTimeout(timer);
        return res;
      } catch (err) {
        clearTimeout(timer);
        throw err;
      }
    };

    let response: Response;
    try {
      response = await makeFetch(this.baseUrl);
    } catch (networkErr: any) {
      // Se falhou por UnknownHostException, Timeout ou queda de túnel, tentar auto-recuperar via Ponte Nuvem
      if (this.apiKey && !this.isResolvingBridge) {
        this.isResolvingBridge = true;
        try {
          const resolved = await BridgeResolver.resolveWorkingConnection(this.apiKey, undefined);
          if (resolved.url && resolved.url !== this.baseUrl) {
            this.baseUrl = resolved.url.replace(/\/+$/, '');
            const saved = await StorageService.getConnection();
            if (saved) {
              await StorageService.saveConnection({
                ...saved,
                server_url: this.baseUrl,
                is_connected: true
              });
            }
            response = await makeFetch(this.baseUrl);
          } else {
            throw networkErr;
          }
        } catch (resolveErr) {
          throw networkErr;
        } finally {
          this.isResolvingBridge = false;
        }
      } else {
        throw networkErr;
      }
    }

    // Se a resposta retornou código de erro de túnel Cloudflare (502, 503, 520-530), tentar auto-resolver
    if (!response.ok && [502, 503, 520, 521, 522, 523, 524, 530].includes(response.status)) {
      if (this.apiKey && !this.isResolvingBridge) {
        this.isResolvingBridge = true;
        try {
          const resolved = await BridgeResolver.resolveWorkingConnection(this.apiKey, undefined);
          if (resolved.url && resolved.url !== this.baseUrl) {
            this.baseUrl = resolved.url.replace(/\/+$/, '');
            const saved = await StorageService.getConnection();
            if (saved) {
              await StorageService.saveConnection({
                ...saved,
                server_url: this.baseUrl,
                is_connected: true
              });
            }
            response = await makeFetch(this.baseUrl);
          }
        } catch (resolveErr) {
          // prosseguir para lançar o erro se a resolução falhou
        } finally {
          this.isResolvingBridge = false;
        }
      }
    }

    if (!response.ok) {
      let errorMsg = `Erro ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          if (typeof errorData.detail === 'string') {
            errorMsg = errorData.detail;
          } else if (Array.isArray(errorData.detail)) {
            // FastAPI 422 Unprocessable Entity validation details
            errorMsg = errorData.detail
              .map((d: any) => d.msg || d.message || JSON.stringify(d))
              .join('; ');
          } else if (typeof errorData.detail === 'object') {
            errorMsg = JSON.stringify(errorData.detail);
          }
        } else if (errorData.message) {
          errorMsg = errorData.message;
        }
      } catch (e) {}
      throw new Error(errorMsg);
    }

    return response.json();
  }

  async testConnection(url: string, key: string): Promise<any> {
    const cleanUrl = url.replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(`${cleanUrl}/api/status`, {
        headers: {
          'X-API-Key': key,
          'Authorization': `Bearer ${key}`
        },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error('Falha na autenticação. Verifique o Token ou a URL informada.');
      }
      return res.json();
    } catch (err: any) {
      clearTimeout(timer);
      throw err;
    }
  }

  async launchDesktop(): Promise<any> {
    return this.request('/api/desktop/launch', { method: 'POST' });
  }

  async getStatus(): Promise<any> {
    return this.request('/api/status');
  }

  async getConversations(limit: number = 50, projectId?: string): Promise<Conversation[]> {
    let endpoint = `/api/conversations?limit=${limit}`;
    if (projectId) {
      endpoint += `&project_id=${encodeURIComponent(projectId)}`;
    }
    return this.request<Conversation[]>(endpoint);
  }

  async getConversation(id: string): Promise<{
    conversation_id: string;
    messages: Message[];
    artifacts: Artifact[];
    is_active?: boolean;
    desktop_pending_text?: string;
    queued_messages?: Array<{
      id: string;
      content: string;
      sender: string;
      timestamp: string;
      source?: string;
      attachment?: { name: string; isImage: boolean; uri: string; base64?: string };
    }>;
    active_tasks?: BackgroundTask[];
  }> {
    return this.request(`/api/conversations/${encodeURIComponent(id)}`);
  }

  async deleteConversation(id: string): Promise<{ status: string; conversation_id: string }> {
    return this.request(`/api/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async sendMessage(
    id: string,
    prompt: string,
    title?: string,
    image?: { base64: string; filename: string },
    file?: { base64: string; filename: string },
    attachments?: Array<{ base64: string; filename: string; is_image?: boolean; mime_type?: string }>
  ): Promise<any> {
    const payloadAttachments = attachments && attachments.length > 0
      ? attachments.map((a) => ({
          base64: a.base64,
          filename: a.filename,
          is_image: !!a.is_image,
          mime_type: a.mime_type
        }))
      : undefined;

    return this.request(`/api/conversations/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        title,
        image_base64: image?.base64,
        image_filename: image?.filename,
        file_base64: file?.base64,
        file_filename: file?.filename,
        attachments: payloadAttachments
      })
    });
  }

  getMediaUrl(conversationId: string, filename: string): string {
    if (!this.baseUrl) return '';
    return `${this.baseUrl}/api/conversations/${encodeURIComponent(conversationId)}/media/${encodeURIComponent(filename)}?token=${encodeURIComponent(this.apiKey)}`;
  }

  async newConversation(prompt: string, model?: string, title?: string, projectId?: string): Promise<any> {
    return this.request('/api/conversations/new', {
      method: 'POST',
      body: JSON.stringify({ prompt, model, title, project_id: projectId })
    });
  }

  async getProjects(): Promise<Project[]> {
    return this.request<Project[]>('/api/projects');
  }

  async createProject(name: string, folderPath: string): Promise<Project> {
    return this.request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, folder_path: folderPath })
    });
  }

  async getSettings(): Promise<AntigravitySettings> {
    return this.request<AntigravitySettings>('/api/settings');
  }

  async updateSettings(settings: AntigravitySettings): Promise<AntigravitySettings> {
    return this.request<AntigravitySettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings })
    });
  }

  async getArtifact(conversationId: string, filename: string): Promise<any> {
    return this.request(`/api/artifacts/${encodeURIComponent(conversationId)}/${encodeURIComponent(filename)}`);
  }

  async getBackgroundTasks(conversationId?: string): Promise<BackgroundTask[]> {
    const endpoint = conversationId
      ? `/api/conversations/${encodeURIComponent(conversationId)}/background-tasks`
      : '/api/background-tasks';
    const res = await this.request<{ tasks: BackgroundTask[] }>(endpoint);
    return res.tasks || [];
  }

  async stopBackgroundTask(conversationId: string, taskId: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/api/conversations/${encodeURIComponent(conversationId)}/background-tasks/${encodeURIComponent(taskId)}/stop`, {
      method: 'POST'
    });
    return res.success;
  }

  async getTokenStats(conversationId: string): Promise<TokenStats> {
    return this.request<TokenStats>(`/api/conversations/${encodeURIComponent(conversationId)}/token-stats`);
  }

  async getSkills(): Promise<Skill[]> {
    const res = await this.request<{ skills: Skill[] }>('/api/skills');
    return res.skills || [];
  }

  async getSkillDetails(skillName: string): Promise<Skill> {
    return this.request<Skill>(`/api/skills/${encodeURIComponent(skillName)}`);
  }

  async getSuggestions(conversationId: string, projectId?: string): Promise<SuggestionItem[]> {
    const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
    const res = await this.request<{ suggestions: SuggestionItem[] }>(`/api/conversations/${encodeURIComponent(conversationId)}/suggestions${query}`);
    return res.suggestions || [];
  }

  async stopConversation(conversationId: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/api/conversations/${encodeURIComponent(conversationId)}/stop`, {
      method: 'POST'
    });
    return res.success;
  }

  async getModels(conversationId?: string): Promise<ModelInfo> {
    const endpoint = conversationId ? `/api/conversations/${encodeURIComponent(conversationId)}/models` : '/api/models';
    return this.request<ModelInfo>(endpoint);
  }

  async setModel(conversationId: string, modelName: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/api/conversations/${encodeURIComponent(conversationId)}/model`, {
      method: 'POST',
      body: JSON.stringify({ model: modelName })
    });
    return res.success;
  }
}

export const api = new ApiService();
