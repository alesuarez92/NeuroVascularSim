"""Background runs: a small in-process job queue.

Solving a large network takes tens of seconds, so interfaces submit an
experiment and poll its job instead of waiting on one request. Jobs run on
worker threads (the numerical work releases the GIL) and finished runs are
saved to the run store like any other run.

Jobs live in memory: a server restart forgets queued and running jobs, but
not the runs they already saved.
"""

from __future__ import annotations

import threading
import uuid
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

from .experiment import ExperimentSpec, RunStore, run_experiment

ACTIVE = ("queued", "running")


class Cancelled(Exception):
    """Raised inside a run to stop it between steps."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Job:
    id: str
    name: str
    status: str = "queued"  # queued, running, done, failed, cancelled
    stage: str = ""  # what the run is doing: network, baseline, or a condition label
    done: int = 0  # steps finished, out of total
    total: int = 0
    created: str = ""
    started: str | None = None
    finished: str | None = None
    run_id: str | None = None
    error: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


class JobQueue:
    def __init__(self, store: RunStore, workers: int = 1, keep: int = 200):
        self.store = store
        self.keep = keep
        self._pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="nvs-job")
        self._jobs: OrderedDict[str, Job] = OrderedDict()
        self._cancel: dict[str, threading.Event] = {}
        self._lock = threading.Lock()

    def submit(self, spec: ExperimentSpec) -> Job:
        """Validate the spec now (errors reach the caller) and queue the run."""
        spec.validate()
        job = Job(id=uuid.uuid4().hex[:12], name=spec.name, created=_now(), total=2 + len(spec.conditions))
        with self._lock:
            self._jobs[job.id] = job
            self._cancel[job.id] = threading.Event()
            self._forget_old()
        self._pool.submit(self._run, job.id, spec)
        return job

    def get(self, job_id: str) -> Job:
        with self._lock:
            return self._jobs[job_id]

    def list(self) -> list[Job]:
        with self._lock:
            return list(reversed(self._jobs.values()))

    def cancel(self, job_id: str) -> Job:
        """Queued jobs never start; running jobs stop before their next step."""
        with self._lock:
            job = self._jobs[job_id]
            if job.status in ACTIVE:
                self._cancel[job_id].set()
                if job.status == "queued":
                    job.status, job.finished = "cancelled", _now()
            return job

    def shutdown(self) -> None:
        with self._lock:
            for job_id, job in self._jobs.items():
                if job.status in ACTIVE:
                    self._cancel[job_id].set()
        self._pool.shutdown(wait=True, cancel_futures=True)

    def _forget_old(self) -> None:
        finished = [j for j in self._jobs.values() if j.status not in ACTIVE]
        for j in finished[: max(0, len(self._jobs) - self.keep)]:
            del self._jobs[j.id]
            self._cancel.pop(j.id, None)

    def _run(self, job_id: str, spec: ExperimentSpec) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            stop = self._cancel.get(job_id)
            if job is None or stop is None or stop.is_set():
                return
            job.status, job.started = "running", _now()

        def progress(stage: str, done: int, total: int) -> None:
            if stop.is_set():
                raise Cancelled()
            with self._lock:
                job.stage, job.done, job.total = stage, done, total

        try:
            record = run_experiment(spec, progress=progress)
            self.store.save(record)
            with self._lock:
                job.status, job.run_id, job.done, job.stage = "done", record.id, job.total, ""
        except Cancelled:
            with self._lock:
                job.status = "cancelled"
        except Exception as e:  # reported to the user through the job
            with self._lock:
                job.status, job.error = "failed", f"{type(e).__name__}: {e}"
        finally:
            with self._lock:
                job.finished = _now()
