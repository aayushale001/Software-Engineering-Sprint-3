import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

export const AdminAuditPage = () => {
  const token = useAuthStore((state) => state.accessToken);

  const query = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: async () => apiClient.listAuditLogs(token ?? ""),
    enabled: Boolean(token)
  });

  return (
    <section className="rounded-2xl bg-white p-5 shadow-glow">
      <h2 className="text-xl font-bold text-accent2">Audit Activity</h2>
      <div className="mt-4 space-y-3">
        {query.data?.logs.map((log) => (
          <article key={log.id} className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
            <p className="font-semibold text-accent2">{log.eventType}</p>
            <p>
              {log.actorType} · {log.actorId}
            </p>
            <p>{new Date(log.occurredAt).toLocaleString()}</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(log.metadata, null, 2)}</pre>
          </article>
        ))}
      </div>
    </section>
  );
};
