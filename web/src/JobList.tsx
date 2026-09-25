import { type Job, jobActive } from "./api";

type Props = { jobs: Job[]; onOpen: (runId: string) => void; onCancel: (id: string) => void };

const STAGE = (j: Job) =>
  j.status === "queued" ? "queued" : j.stage === "network" ? "building network" : `solving ${j.stage}`;

/** Background runs: progress, cancel, and open when done. */
export function JobList({ jobs, onOpen, onCancel }: Props) {
  if (!jobs.length) return <p className="muted">No jobs yet.</p>;
  return (
    <ul className="jobs">
      {jobs.map((j) => (
        <li key={j.id} className={`job ${j.status}`}>
          <div className="row between">
            <span>{j.name}</span>
            {jobActive(j) ? (
              <button className="ghost small" onClick={() => onCancel(j.id)}>Cancel</button>
            ) : j.status === "done" && j.run_id ? (
              <button className="ghost small" onClick={() => onOpen(j.run_id!)}>Open</button>
            ) : null}
          </div>
          {jobActive(j) ? (
            <>
              <progress max={Math.max(j.total, 1)} value={j.done} aria-label={`${j.name} progress`} />
              <span className="muted">{STAGE(j)} · step {Math.min(j.done + 1, j.total)} of {j.total}</span>
            </>
          ) : (
            <span className={j.status === "failed" ? "error" : "muted"}>
              {j.status}{j.error ? `: ${j.error}` : ""}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Of the jobs that just finished, the one whose result the page should show:
 * the latest submission from this page, unless a later submission is still
 * pending or already done (cancelled and failed ones are skipped over).
 */
export function runToShow(submitted: string[], jobs: Job[], finished: Job[]): Job | undefined {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  for (let i = submitted.length - 1; i >= 0; i--) {
    const j = byId.get(submitted[i]);
    if (!j || j.status === "cancelled") continue;
    return finished.some((f) => f.id === j.id) ? j : undefined; // the latest that counts has not just finished
  }
  return undefined;
}
