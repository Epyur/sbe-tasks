export interface CachedSubtask {
  id: string;
  title: string;
}

export interface CachedTask {
  id: string;
  title: string;
  description: string;
  columnId: string;
  columnTitle: string;
  boardId: string;
  boardTitle: string;
  projectId: string;
  projectTitle: string;
  completed: boolean;
  completeAt?: number;
  completeAtCheckedAt?: number;
  assigned: string[];
  subtasks: CachedSubtask[];
  timestamp: number;
  cachedAt: number;
  updatedAt: string;
  deadline?: number;
}

export interface OfflineAction {
  id: string;
  type: 'create-task' | 'update-task' | 'upload-file' | 'add-info' | 'toggle-completed' | 'send-message';
  payload: Record<string, unknown>;
  createdAt: number;
  synced: boolean;
}

export interface CachedProject {
  id: string;
  title: string;
}

export interface CachedBoard {
  id: string;
  title: string;
  projectId: string;
}

export interface CachedColumn {
  id: string;
  title: string;
  boardId: string;
}

export interface CachedUser {
  id: string;
  name: string;
  email: string;
}

export interface TasksCacheData {
  tasks: CachedTask[];
  projects: CachedProject[];
  boards: CachedBoard[];
  columns: CachedColumn[];
  users: CachedUser[];
  lastSyncAt: number;
  offlineQueue: OfflineAction[];
}
