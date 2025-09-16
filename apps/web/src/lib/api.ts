import type { IntegrityReport, ProctorEvent, Session } from '@focus-proctor/types';

import { appEnv } from './env';

const base = () => appEnv.apiUrl.replace(/\/$/, '');

const buildJsonHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (appEnv.apiJwt) headers.Authorization = `Bearer ${appEnv.apiJwt}`;
  return headers;
};

export const createSession = async (candidateName: string): Promise<string> => {
  const res = await fetch(`${base()}/api/sessions`, {
    method: 'POST',
    headers: buildJsonHeaders(),
    body: JSON.stringify({ candidateName }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create session (${res.status})`);
  }
  const data = (await res.json()) as { _id: string };
  return data._id;
};

export const endSession = async (sessionId: string): Promise<void> => {
  const res = await fetch(`${base()}/api/sessions/${sessionId}/end`, {
    method: 'PATCH',
    headers: buildJsonHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to end session (${res.status})`);
  }
};

export const appendEvents = async (sessionId: string, events: ProctorEvent[]): Promise<void> => {
  if (events.length === 0) return;
  const res = await fetch(`${base()}/api/sessions/${sessionId}/events`, {
    method: 'POST',
    headers: buildJsonHeaders(),
    body: JSON.stringify({ events }),
  });
  if (!res.ok) {
    throw new Error(`Failed to append events (${res.status})`);
  }
};

export const getSession = async (sessionId: string): Promise<Session> => {
  const res = await fetch(`${base()}/api/sessions/${sessionId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch session (${res.status})`);
  }
  return (await res.json()) as Session;
};

export const uploadVideo = async (
  sessionId: string,
  blob: Blob,
  filename = `focus-proctor-${sessionId}.webm`,
): Promise<string> => {
  const form = new FormData();
  form.append('sessionId', sessionId);
  form.append('file', blob, filename);
  const headers: Record<string, string> = {};
  if (appEnv.apiJwt) headers.Authorization = `Bearer ${appEnv.apiJwt}`;
  const res = await fetch(`${base()}/api/uploads/video`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Failed to upload video (${res.status})`);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
};

export const getReport = async (sessionId: string): Promise<IntegrityReport> => {
  const res = await fetch(`${base()}/api/reports/${sessionId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch report (${res.status})`);
  }
  return (await res.json()) as IntegrityReport;
};
