import { API_BASE_URL } from './auth';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `API 오류: ${res.status}`);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationSettings {
  id: string;
  userId: string;
  reminderEnabled: boolean;
  reminderFrequencyDays: number;
  reminderConditionDays: number;
  reminderTime: string;
  pushEnabled: boolean;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// GET /notifications
export async function fetchNotifications(): Promise<NotificationsResponse> {
  return apiFetch<NotificationsResponse>('/notifications');
}

// PATCH /notifications/:id/read
export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch('/notifications/read-all', { method: 'PATCH' });
}

// DELETE /notifications/:id
export async function deleteNotification(id: string): Promise<void> {
  await apiFetch(`/notifications/${id}`, { method: 'DELETE' });
}

// GET /notifications/settings
export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  return apiFetch<NotificationSettings>('/notifications/settings');
}

// PUT /notifications/settings
export async function updateNotificationSettings(
  settings: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  return apiFetch<NotificationSettings>('/notifications/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// POST /notifications/push-subscriptions
export async function subscribePush(
  subscription: PushSubscriptionPayload,
): Promise<void> {
  await apiFetch('/notifications/push-subscriptions', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });
}

// DELETE /notifications/push-subscriptions
export async function unsubscribePush(endpoint: string): Promise<void> {
  await apiFetch('/notifications/push-subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });
}
