export interface Conversation {
  id: string;
  title: string;
  preview: string;
  step_count: number;
  last_modified_time: string;
  workspace_uris: string[];
  status: string;
  source?: string;
  project_id: string;
  project_name: string;
  agent_name?: string;
  is_active: boolean;
  last_user_input_time?: string;
}

export interface QuestionItem {
  question: string;
  options: string[];
  is_multi_select?: boolean;
}

export interface ToolCall {
  name: string;
  title?: string;
  icon?: string;
  detail?: string;
  args?: Record<string, any>;
  status?: string;
  questions?: QuestionItem[];
}

export interface MediaItem {
  mime_type: string;
  filename: string;
  url?: string;
  local_uri?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  step_index: number;
  created_at: string;
  content?: string;
  thinking?: string;
  thought_duration?: string;
  thought_label?: string;
  tool_call?: ToolCall;
  tool_calls?: ToolCall[];
  media?: MediaItem[];
  type: 'user_message' | 'planner_response' | 'assistant_message' | 'thought_step' | 'tool_step';
}

export interface Artifact {
  name: string;
  size: number;
  modified_at: string;
  summary?: string;
  user_facing: boolean;
  is_markdown: boolean;
  is_image: boolean;
  request_feedback?: boolean;
}

export interface BackgroundTask {
  task_id: string;
  full_id: string;
  description: string;
  created_at: string;
  status: 'running' | 'completed' | 'failed';
  is_daemon: boolean;
  tool_name: string;
  log_size?: number;
  log_tail?: string;
}

export interface TokenStats {
  conversation_id: string;
  steps_count: number;
  current_context_tokens: number;
  context_window_size: number;
  context_percent_used: number;
  latest_input_tokens: number;
  latest_cache_read_tokens: number;
  latest_output_tokens: number;
  total_output_tokens: number;
  cache_savings_percent: number;
  active_model: string;
}

export interface Skill {
  name: string;
  folder_name: string;
  description: string;
  category: string;
  path: string;
  content?: string;
}

export interface SuggestionItem {
  id: string;
  title: string;
  prompt: string;
  type?: 'fill_input' | 'instant_execute';
  highlight?: boolean;
  icon?: string;
}

export interface Project {
  id: string;
  name: string;
  folder_path: string;
  settings?: Record<string, any>;
}

export interface AntigravitySettings {
  model?: string;
  autoExecutionPolicy?: string;
  enableTerminalSandbox?: boolean;
  artifactReviewMode?: string;
  nonWorkspaceFileAccessPolicy?: string;
  themeMode?: string;
  remoteControlHostname?: string;
  [key: string]: any;
}

export interface ConnectionConfig {
  server_url: string;
  api_key: string;
  hostname?: string;
  is_connected?: boolean;
  last_connected_at?: string;
}
