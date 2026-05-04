// React Query hooks. One per endpoint we read from.

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, type Range } from "@/lib/api";

export const useSystemHealth = () =>
  useQuery({ queryKey: ["systemHealth"], queryFn: api.systemHealth, refetchInterval: 5_000 });

export const useSystemState = () =>
  useQuery({ queryKey: ["systemState"], queryFn: api.systemState });

export const useAttention = () =>
  useQuery({ queryKey: ["attention"], queryFn: api.attention, refetchInterval: 10_000 });

export const usePressure = () =>
  useQuery({ queryKey: ["pressure"], queryFn: api.pressure, refetchInterval: 30_000 });

export const useSummary = () =>
  useQuery({ queryKey: ["summary"], queryFn: api.summary, refetchInterval: 15_000 });

export const useSessions = (params: Parameters<typeof api.sessions>[0] = {}) =>
  useQuery({
    queryKey: ["sessions", params],
    queryFn: () => api.sessions(params),
    placeholderData: keepPreviousData,
  });

export const useSessionDetails = (sid: string | null | undefined) =>
  useQuery({
    queryKey: ["sessionDetails", sid],
    queryFn: () => api.sessionDetails(sid!),
    enabled: !!sid,
  });

export const useLiveSessions = () =>
  useQuery({ queryKey: ["liveSessions"], queryFn: api.liveSessions, refetchInterval: 5_000 });

/**
 * Subscribe to a live session's JSONL stream via SSE. Each incoming event
 * triggers a debounced invalidation of the sessionDetails query so the
 * existing aggregation pipeline stays the source of truth. The browser
 * handles reconnection (with Last-Event-ID) automatically.
 */
export function useLiveSessionStream(sid: string | null | undefined) {
  const qc = useQueryClient();
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sid) return;
    setDone(false);
    setLastEventAt(null);
    const es = new EventSource(`/api/sessions/live/${sid}/stream`);
    const scheduleRefetch = () => {
      if (debounceRef.current !== null) return;
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        qc.invalidateQueries({ queryKey: ["sessionDetails", sid] });
      }, 400);
    };
    es.onmessage = () => {
      setLastEventAt(Date.now());
      scheduleRefetch();
    };
    es.addEventListener("done", () => {
      setDone(true);
      es.close();
    });
    es.onerror = () => {
      // Let the browser auto-reconnect; nothing to do here.
    };
    return () => {
      es.close();
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [sid, qc]);

  return { lastEventAt, done };
}

export const useUsageTokens = (range: Range) =>
  useQuery({ queryKey: ["usageTokens", range], queryFn: () => api.usageTokens(range) });

export const useUsageCache = (range: Range) =>
  useQuery({ queryKey: ["usageCache", range], queryFn: () => api.usageCache(range) });

export const useOutcomes = (range: Range) =>
  useQuery({ queryKey: ["outcomes", range], queryFn: () => api.outcomes(range) });

export const useToolLatency = (range: Range) =>
  useQuery({ queryKey: ["toolLatency", range], queryFn: () => api.toolLatency(range) });

export const useToolLatencySeries = (range: Range) =>
  useQuery({ queryKey: ["toolLatencySeries", range], queryFn: () => api.toolLatencySeries(range) });

export const useSessionSparks = (ids: string[]) =>
  useQuery({
    queryKey: ["sessionSparks", ids.slice().sort().join(",")],
    queryFn: () => api.sessionSparks(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });

export const useHookActivity = (range: Range) =>
  useQuery({ queryKey: ["hookActivity", range], queryFn: () => api.hookActivity(range) });

export const useByProject = (range: Range) =>
  useQuery({ queryKey: ["byProject", range], queryFn: () => api.byProject(range) });

export const useAgentFanout = (range: Range) =>
  useQuery({ queryKey: ["agentFanout", range], queryFn: () => api.agentFanout(range) });

export const useEditDecisions = (range: Range) =>
  useQuery({ queryKey: ["editDecisions", range], queryFn: () => api.editDecisions(range) });

export const useProductivity = (range: Range) =>
  useQuery({ queryKey: ["productivity", range], queryFn: () => api.productivity(range) });

export const useActivityHourly = () =>
  useQuery({ queryKey: ["activityHourly"], queryFn: api.activityHourly, refetchInterval: 60_000 });

export const useActivityDaily = (days = 365) =>
  useQuery({ queryKey: ["activityDaily", days], queryFn: () => api.activityDaily(days), refetchInterval: 5 * 60_000 });

export const useMCPList = (range: Range) =>
  useQuery({ queryKey: ["mcpList", range], queryFn: () => api.mcpList(range) });

export function useMCPMeasure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.mcpMeasure,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcpList"] }),
  });
}

export const useMCPTools = (server: string | null, range: Range) =>
  useQuery({
    queryKey: ["mcpTools", server, range],
    queryFn: () => api.mcpTools(server!, range),
    enabled: !!server,
  });

export const useSkills = (params: Parameters<typeof api.skillsList>[0] = {}) =>
  useQuery({ queryKey: ["skills", params], queryFn: () => api.skillsList(params) });

export const useDecisions = (status: "pending" | "answered" = "pending") =>
  useQuery({ queryKey: ["decisions", status], queryFn: () => api.decisions(status), refetchInterval: 5_000 });

export const useInbox = (params: Parameters<typeof api.inbox>[0] = {}) =>
  useQuery({ queryKey: ["inbox", params], queryFn: () => api.inbox(params), refetchInterval: 10_000 });

export const useTasks = (params: Parameters<typeof api.tasks>[0] = {}) =>
  useQuery({ queryKey: ["tasks", params], queryFn: () => api.tasks(params), refetchInterval: 5_000 });

export const useSchedules = () =>
  useQuery({ queryKey: ["schedules"], queryFn: api.schedules, refetchInterval: 30_000 });

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useTaskCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.taskCreate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useTaskApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.taskApprove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useTaskRerun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.taskRerun,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useTaskDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.taskDelete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useScheduleCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.scheduleCreate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });
}

export function useScheduleUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => api.scheduleUpdate(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });
}

export function useScheduleDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.scheduleDelete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });
}

export function useDecisionAnswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, answer }: { id: number; answer: string }) => api.decisionAnswer(id, answer),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["decisions"] }),
  });
}

export function useInboxRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.inboxRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
  });
}

export function useInboxReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => api.inboxReply(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
  });
}

export function useEmergencyStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.emergencyStop,
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useSkillAutonomy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, level }: { name: string; level: "auto" | "review" | "manual" }) =>
      api.skillAutonomy(name, level),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export function useLiveMessage() {
  return useMutation({
    mutationFn: ({ sid, body }: { sid: string; body: string }) => api.liveMessage(sid, body),
  });
}
