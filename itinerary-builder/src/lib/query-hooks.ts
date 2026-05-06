'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, STATIC_STALE, LIVE_STALE } from './query-client';

// ─── Query keys (centralised so invalidation is consistent) ──────────────────

export const QK = {
  // master data
  users:        ['users']        as const,
  states:       ['states']       as const,
  destinations: ['destinations'] as const,
  suppliers:    ['suppliers']    as const,
  hotels:       (stateId?: string) => ['hotels', stateId] as const,
  vehicleTypes: ['vehicle-types'] as const,
  activities:   ['activities']   as const,
  agents:       ['agents']       as const,
  policies:     ['policies']     as const,

  // live CRM data
  pipelines:    ['pipelines']    as const,
  pipeline:     (id: string)    => ['pipeline', id]    as const,
  leads:        ['leads']        as const,
  lead:         (id: string)    => ['lead', id]        as const,
  contacts:     (params: string) => ['contacts', params] as const,
  quotes:       ['quotes']       as const,
  notifications: ['notifications'] as const,
};

// ─── Master data hooks (5 min stale — survive page navigation) ───────────────

export function useUsers() {
  return useQuery({
    queryKey: QK.users,
    queryFn: () => apiFetch<{ id: string; name: string; role: string; email: string }[]>('/api/v1/users').then(
      d => Array.isArray(d) ? d : ((d as { items?: unknown[] }).items ?? []) as { id: string; name: string; role: string; email: string }[]
    ).catch(() => [] as { id: string; name: string; role: string; email: string }[]),
    staleTime: STATIC_STALE,
  });
}

export function useStates() {
  return useQuery({
    queryKey: QK.states,
    queryFn: () => apiFetch('/api/v1/states'),
    staleTime: STATIC_STALE,
  });
}

export function useAgents() {
  return useQuery({
    queryKey: QK.agents,
    queryFn: () => apiFetch('/api/v1/agents'),
    staleTime: STATIC_STALE,
  });
}

// ─── Live CRM hooks ───────────────────────────────────────────────────────────

export function usePipelines() {
  return useQuery({
    queryKey: QK.pipelines,
    queryFn: () => apiFetch('/api/v1/pipelines'),
    staleTime: LIVE_STALE,
  });
}

export function usePipeline(id: string, params: URLSearchParams) {
  return useQuery({
    queryKey: [...QK.pipeline(id), params.toString()],
    queryFn: () => apiFetch(`/api/v1/pipelines/${id}?${params}`),
    staleTime: LIVE_STALE,
    enabled: !!id,
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: QK.lead(id),
    queryFn:  () => apiFetch(`/api/v1/leads/${id}`),
    staleTime: LIVE_STALE,
    enabled:   !!id,
  });
}

export function useContacts(params: URLSearchParams) {
  const key = params.toString();
  return useQuery({
    queryKey: QK.contacts(key),
    queryFn:  () => apiFetch(`/api/v1/crm/contacts?${key}`),
    staleTime: LIVE_STALE,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: QK.notifications,
    queryFn:  () => fetch('/api/v1/notifications').then(r => r.json()).then(d => d.data),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

// ─── Lead stage mutation with optimistic update ───────────────────────────────

export function useLeadStageMutation(pipelineId: string, params: URLSearchParams) {
  const qc = useQueryClient();
  const pipelineKey = [...QK.pipeline(pipelineId), params.toString()];

  return useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) =>
      fetch(`/api/v1/leads/${leadId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId }),
      }).then(r => r.json()),

    onMutate: async ({ leadId, stageId }) => {
      await qc.cancelQueries({ queryKey: pipelineKey });
      const previous = qc.getQueryData(pipelineKey);

      qc.setQueryData(pipelineKey, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        const pipeline = old as { leads: { id: string; stage_id: string; stage?: unknown }[] };
        return {
          ...pipeline,
          leads: pipeline.leads.map(l =>
            l.id === leadId ? { ...l, stage_id: stageId } : l
          ),
        };
      });

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(pipelineKey, context.previous);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: pipelineKey });
    },
  });
}

// ─── Note / Call / Task mutations with cache invalidation ─────────────────────

export function useAddNote(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      fetch(`/api/v1/leads/${leadId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.lead(leadId) }),
  });
}

export function useLogCall(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetch(`/api/v1/leads/${leadId}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.lead(leadId) }),
  });
}

export function useAddTask(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetch(`/api/v1/leads/${leadId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.lead(leadId) }),
  });
}

export function useMarkTaskDone(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      fetch(`/api/v1/leads/${leadId}/tasks?taskId=${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.lead(leadId) }),
  });
}

// ─── Prefetch helpers ─────────────────────────────────────────────────────────

export function usePrefetchLead() {
  const qc = useQueryClient();
  return (leadId: string) => {
    qc.prefetchQuery({
      queryKey: QK.lead(leadId),
      queryFn:  () => apiFetch(`/api/v1/leads/${leadId}`),
      staleTime: LIVE_STALE,
    });
  };
}
