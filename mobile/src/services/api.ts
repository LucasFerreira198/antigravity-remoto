import { Conversation, Message, Artifact, Project, AntigravitySettings } from '../types';
import { StorageService } from './storage';

class ApiService {
  private baseUrl: string = '';
  private apiKey: string = '';

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

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'Authorization': `Bearer ${this.apiKey}`,
      ...(options.headers as Record<string, string> || {})
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      let errorMsg = `Erro ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.detail) errorMsg = errorData.detail;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    return response.json();
  }

  async testConnection(url: string, key: string): Promise<any> {
    const cleanUrl = url.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/api/status`, {
      headers: {
        'X-API-Key': key,
        'Authorization': `Bearer ${key}`
      }
    });
    if (!res.ok) {
      throw new Error('Falha na autenticação. Verifique o Token ou a URL informada.');
    }
    return res.json();
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

  async getConversation(id: string): Promise<{ conversation_id: string; messages: Message[]; artifacts: Artifact[]; is_active?: boolean }> {
    return this.request(`/api/conversations/${encodeURIComponent(id)}`);
  }

  async sendMessage(id: string, prompt: string, title?: string, image?: { base64: string; filename: string }): Promise<any> {
    return this.request(`/api/conversations/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        title,
        image_base64: image?.base64,
        image_filename: image?.filename
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
}

export const api = new ApiService();
