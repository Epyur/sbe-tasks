export interface YouGileTask {
  id: string;
  title: string;
  description?: string;
  columnId?: string;
  completed?: boolean;
  completedTimestamp?: number;
  completeAt?: number;
  assigned?: string[];
  subtasks?: string[];
  timestamp?: number;
  createdAt?: string;
  updatedAt?: string;
  deadline?: {
    deadline?: number;
    startDate?: number;
    withTime?: boolean;
  };
}

export interface YouGileTaskListResponse {
  content: YouGileTask[];
  paging?: { limit: number; offset: number; next: boolean };
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  columnId?: string;
  assigned?: string[];
  deadline?: {
    deadline?: number;
    startDate?: number;
    withTime?: boolean;
  };
  timeTracking?: {
    plan?: number;
    work?: number;
  };
  checklists?: Array<{
    title: string;
    items: Array<{ title: string; isCompleted: boolean }>;
  }>;
  stickers?: Record<string, string>;
  color?: string;
}

export interface YouGileProject {
  id: string;
  title: string;
}

export interface YouGileProjectListResponse {
  content: YouGileProject[];
  paging?: { limit: number; offset: number; next: boolean };
}

export interface YouGileBoard {
  id: string;
  title: string;
  projectId: string;
}

export interface YouGileBoardListResponse {
  content: YouGileBoard[];
  paging?: { limit: number; offset: number; next: boolean };
}

export interface YouGileColumn {
  id: string;
  title: string;
  boardId: string;
}

export interface YouGileColumnListResponse {
  content: YouGileColumn[];
  paging?: { limit: number; offset: number; next: boolean };
}

export interface YouGileUser {
  id: string;
  name?: string;
  email?: string;
}

export interface YouGileTaskFull {
  id: string;
  deleted?: boolean;
  title: string;
  timestamp: number;
  columnId?: string;
  boardId?: string;
  projectId?: string;
  description?: string;
  color?: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  archived?: boolean;
  archivedTimestamp?: number;
  completed?: boolean;
  completedTimestamp?: number;
  complete?: boolean;
  completeAt?: string;
  assignedUserIds?: string[];
  parentTaskIds?: string[];
  messages?: Array<{
    authorId: string;
    timestamp: number;
    text: string;
    mentions?: string[];
  }>;
  subtasks?: string[];
  assigned?: string[];
  deadline?: {
    deadline?: number;
    startDate?: number;
    withTime?: boolean;
    history?: string[];
    blockedPoints?: string[];
    links?: string[];
  };
  timeTracking?: {
    plan?: number;
    work?: number;
  };
  checklists?: Array<{
    title: string;
    items: Array<{ title: string; isCompleted: boolean }>;
  }>;
  stickers?: Record<string, string>;
  idTaskCommon?: string;
  idTaskProject?: string;
  type?: string;
  stopwatch?: {
    running?: boolean;
    time?: number;
    timestamp?: number;
    seconds?: number;
    atMoment?: number;
  };
  timer?: {
    running?: boolean;
    seconds?: number;
    timestamp?: number;
    since?: number;
  };
  deal?: {
    dealAmount?: number;
    customFields?: Record<string, unknown>;
    organizationId?: string;
    contactPersonIds?: string[];
  };
  extensionData?: Record<string, unknown>;
}

export interface YouGileUserListResponse {
  content: YouGileUser[];
  paging?: { limit: number; offset: number; next: boolean };
}

export interface YouGileGroupChat {
  id: string;
  title: string;
  users: Record<string, { notified: boolean }>;
  userRoleMap: Record<string, string>;
  roleConfigMap: Record<string, Record<string, boolean>>;
}

export interface YouGileGroupChatListResponse {
  paging: { limit: number; offset: number; next: boolean };
  content: YouGileGroupChat[];
}

export interface YouGileChatMessage {
  id: number;
  fromUserId: string;
  text: string;
  textHtml?: string;
  label?: string;
  editTimestamp?: number;
}

export interface YouGileChatMessageListResponse {
  paging: { limit: number; offset: number; next: boolean };
  content: YouGileChatMessage[];
}

export interface YouGileApiError {
  status: number;
  message: string;
}
