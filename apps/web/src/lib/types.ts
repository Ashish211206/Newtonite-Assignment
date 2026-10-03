export type User = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  globalRole: "ADMIN" | "USER";
  memberships?: { teamId: string; role: string; team?: { id: string; name: string } }[];
};

export type WorkItem = {
  id: string;
  number: number;
  key: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  teamId: string;
  reporterId: string;
  assigneeId: string | null;
  dueDate: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  team?: { id: string; name: string };
  reporter?: { id: string; name: string; email: string; avatar: string | null };
  assignee?: { id: string; name: string; email: string; avatar: string | null } | null;
  capabilities?: Record<string, boolean>;
};

export type Paged<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
