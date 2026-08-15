import { getService, getServiceSync } from '../../../sbe-core/src/bridge';
import type { SbeYougileApi } from '../../../sbe-core/src/types';
import type {
  CreateTaskPayload,
  YouGileBoard,
  YouGileChatMessage,
  YouGileColumn,
  YouGileGroupChat,
  YouGileProject,
  YouGileTask,
  YouGileTaskFull,
  YouGileUser,
} from '../types/yougile';

export interface YougileStatus {
  authenticated: boolean;
  companyId?: string;
  login?: string;
}

/**
 * Типизированный потребитель сервиса sbe-yougile (мост window.SBE).
 * Ленивое получение: getServiceSync (быстро) → getService (поллинг до 15 с).
 */
export class YougileConsumer {
  /** Быстрый синхронный признак: сервис опубликован и авторизован. */
  isAvailable(): boolean {
    const api = getServiceSync('sbe-yougile');
    if (!api) return false;
    return api.getStatus().authenticated;
  }

  /** Асинхронное получение API сервиса; при отсутствии — понятная ошибка моста. */
  async getApi(): Promise<SbeYougileApi> {
    const sync = getServiceSync('sbe-yougile');
    if (sync) return sync;
    return getService('sbe-yougile');
  }

  async getStatus(): Promise<YougileStatus> {
    return (await this.getApi()).getStatus();
  }

  async getUsers(): Promise<YouGileUser[]> {
    const api = await this.getApi();
    return await api.client.getUsers() as YouGileUser[];
  }

  async getProjects(): Promise<YouGileProject[]> {
    const api = await this.getApi();
    return await api.client.getProjects() as YouGileProject[];
  }

  async getBoards(): Promise<YouGileBoard[]> {
    const api = await this.getApi();
    return await api.client.getBoards() as YouGileBoard[];
  }

  async getColumns(boardId?: string): Promise<YouGileColumn[]> {
    const api = await this.getApi();
    return await api.client.getColumns(boardId) as YouGileColumn[];
  }

  async getColumnById(columnId: string): Promise<YouGileColumn> {
    const api = await this.getApi();
    return await api.client.getColumnById(columnId) as YouGileColumn;
  }

  async getTasks(): Promise<YouGileTask[]> {
    const api = await this.getApi();
    return await api.client.getTasks() as YouGileTask[];
  }

  async getTaskById(id: string): Promise<YouGileTaskFull> {
    const api = await this.getApi();
    return await api.client.getTaskById(id) as YouGileTaskFull;
  }

  async createTask(payload: CreateTaskPayload): Promise<{ id: string }> {
    const api = await this.getApi();
    return await api.client.createTask(payload) as { id: string };
  }

  async updateTask(id: string, patch: Record<string, unknown>): Promise<void> {
    const api = await this.getApi();
    await api.client.updateTask(id, patch);
  }

  async getGroupChats(): Promise<YouGileGroupChat[]> {
    const api = await this.getApi();
    return await api.client.getGroupChats() as YouGileGroupChat[];
  }

  async getChatMessages(chatId: string): Promise<YouGileChatMessage[]> {
    const api = await this.getApi();
    return await api.client.getChatMessages(chatId) as YouGileChatMessage[];
  }

  async sendChatMessage(chatId: string, text: string): Promise<void> {
    const api = await this.getApi();
    await api.client.sendChatMessage(chatId, text);
  }

  async getTaskChatSubscribers(taskId: string): Promise<string[]> {
    const api = await this.getApi();
    return await api.client.getTaskChatSubscribers(taskId);
  }

  async uploadFile(name: string, data: ArrayBuffer): Promise<string> {
    const api = await this.getApi();
    return await api.client.uploadFile({ name, data });
  }
}
