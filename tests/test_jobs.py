import json
import threading
import time
from pathlib import Path

import pytest

from neurovascularsim.experiment import ExperimentSpec, RunStore
from neurovascularsim.jobs import JobQueue

EXAMPLE = json.loads((Path(__file__).resolve().parents[1] / "examples" / "suarez2021a_stealing.json").read_text())


def wait(queue, job_id, timeout=60):
    t0 = time.time()
    while queue.get(job_id).status in ("queued", "running"):
        assert time.time() - t0 < timeout, "job did not finish"
        time.sleep(0.02)
    return queue.get(job_id)


@pytest.fixture
def queue(tmp_path):
    q = JobQueue(RunStore(tmp_path), workers=1)
    yield q
    q.shutdown()


def test_job_runs_and_saves(queue):
    job = queue.submit(ExperimentSpec.from_dict(EXAMPLE))
    assert job.total == 2 + len(EXAMPLE["conditions"])
    done = wait(queue, job.id)
    assert done.status == "done" and done.done == done.total
    assert queue.store.load(done.run_id)["spec"]["name"] == EXAMPLE["name"]


def test_invalid_spec_is_rejected_at_submission(queue):
    with pytest.raises(KeyError):
        queue.submit(ExperimentSpec.from_dict(dict(EXAMPLE, solver={"viscosity": "nope"})))
    assert queue.list() == []


def test_failure_is_reported(queue):
    bad = dict(EXAMPLE, network={"name": "suarez2021a", "params": {"bogus": 1}})
    job = wait(queue, queue.submit(ExperimentSpec.from_dict(bad)).id)
    assert job.status == "failed" and "bogus" in job.error


def test_cancel_queued_and_running(queue, monkeypatch):
    from neurovascularsim import jobs

    started, release = threading.Event(), threading.Event()
    real = jobs.run_experiment

    def slow(spec, progress=None):
        def gate(stage, done, total):
            started.set()
            release.wait(10)
            progress(stage, done, total)
        return real(spec, progress=gate)

    monkeypatch.setattr(jobs, "run_experiment", slow)
    first = queue.submit(ExperimentSpec.from_dict(EXAMPLE))
    second = queue.submit(ExperimentSpec.from_dict(EXAMPLE))
    assert started.wait(10)
    assert queue.cancel(second.id).status == "cancelled"  # never starts
    queue.cancel(first.id)
    release.set()
    assert wait(queue, first.id).status == "cancelled"
    assert queue.get(second.id).started is None
    assert queue.store.list() == []
