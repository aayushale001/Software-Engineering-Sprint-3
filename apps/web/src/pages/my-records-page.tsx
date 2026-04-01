import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient, type MedicalRecord } from "../lib/api";
import { useAuthStore } from "../store/auth-store";

export const MyRecordsPage = () => {
  const token = useAuthStore((state) => state.accessToken);

  const query = useQuery({
    queryKey: ["records"],
    queryFn: async () => apiClient.listRecords(token ?? ""),
    enabled: Boolean(token)
  });

  const [createTitle, setCreateTitle] = useState("");
  const [createType, setCreateType] = useState("lab_result");
  const [createDate, setCreateDate] = useState("");
  const [createKey, setCreateKey] = useState("notes");
  const [createValue, setCreateValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("");
  const [editDate, setEditDate] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiClient.createRecord(token ?? "", {
        title: createTitle,
        recordType: createType,
        recordDate: createDate,
        entries: [
          {
            key: createKey,
            value: createValue
          }
        ]
      });
    },
    onSuccess: async () => {
      setStatus("Record created.");
      setCreateTitle("");
      setCreateValue("");
      await query.refetch();
    },
    onError: (error) => {
      setStatus((error as Error).message);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) {
        throw new Error("No record selected");
      }

      return apiClient.updateRecord(token ?? "", editingId, {
        title: editTitle,
        recordType: editType,
        recordDate: editDate
      });
    },
    onSuccess: async () => {
      setStatus("Record updated.");
      setEditingId(null);
      await query.refetch();
    },
    onError: (error) => {
      setStatus((error as Error).message);
    }
  });

  const records = (query.data?.records ?? []) as MedicalRecord[];

  return (
    <section className="space-y-5">
      <article className="rounded-2xl bg-white p-4 shadow-glow">
        <h2 className="text-xl font-bold text-accent2">My Medical Records</h2>
        <p className="text-sm text-slate-600">You can create and update your personal records here.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            type="text"
            placeholder="Record title"
            value={createTitle}
            onChange={(event) => setCreateTitle(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2"
          />
          <input
            type="text"
            placeholder="Record type"
            value={createType}
            onChange={(event) => setCreateType(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2"
          />
          <input
            type="date"
            value={createDate}
            onChange={(event) => setCreateDate(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2"
          />
          <input
            type="text"
            placeholder="Entry key"
            value={createKey}
            onChange={(event) => setCreateKey(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2"
          />
          <textarea
            placeholder="Entry value"
            value={createValue}
            onChange={(event) => setCreateValue(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 md:col-span-2"
          />
        </div>

        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !createTitle || !createDate || !createKey || !createValue}
          className="mt-3 rounded-xl bg-accent px-4 py-2 font-semibold text-white hover:bg-accent2 disabled:opacity-70"
        >
          Add Record
        </button>
      </article>

      <article className="rounded-2xl bg-white p-4 shadow-glow">
        <h3 className="text-lg font-bold text-accent2">Existing Records</h3>
        <div className="mt-4 space-y-3">
          {records.map((record) => (
            <article key={record.id} className="rounded-xl border border-slate-200 p-3">
              {editingId === record.id ? (
                <div className="grid gap-2 md:grid-cols-3">
                  <input
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    className="rounded-lg border border-slate-200 px-2 py-1"
                  />
                  <input
                    value={editType}
                    onChange={(event) => setEditType(event.target.value)}
                    className="rounded-lg border border-slate-200 px-2 py-1"
                  />
                  <input
                    type="date"
                    value={editDate}
                    onChange={(event) => setEditDate(event.target.value)}
                    className="rounded-lg border border-slate-200 px-2 py-1"
                  />
                  <div className="md:col-span-3">
                    <button
                      type="button"
                      onClick={() => updateMutation.mutate()}
                      className="rounded-lg bg-accent2 px-3 py-1 text-sm font-semibold text-white"
                    >
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="ml-2 rounded-lg border border-slate-300 px-3 py-1 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-semibold text-accent2">{record.title}</p>
                  <p className="text-sm text-slate-600">Type: {record.recordType}</p>
                  <p className="text-sm text-slate-600">Date: {record.recordDate}</p>
                  {(record.entries ?? []).length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {(record.entries ?? []).map((entry) => (
                        <div key={entry.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          <p className="font-medium text-accent2">{entry.key}</p>
                          <p className="mt-1 whitespace-pre-wrap text-slate-600">{entry.value}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(record.id);
                      setEditTitle(record.title);
                      setEditType(record.recordType);
                      setEditDate(record.recordDate.slice(0, 10));
                    }}
                    className="mt-3 rounded-lg border border-slate-300 px-3 py-1 text-sm"
                  >
                    Edit
                  </button>
                </>
              )}
            </article>
          ))}
        </div>
      </article>

      {status ? <p className="text-sm text-slate-700">{status}</p> : null}
    </section>
  );
};
