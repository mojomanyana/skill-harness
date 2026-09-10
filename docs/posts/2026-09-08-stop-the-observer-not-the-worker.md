# Draft: stop the observer, not the worker

The bounded archive watcher reads an explicitly allowed file under a pinned policy. It records checkpoints and gaps without a worker hook, prompt or control channel. Policy changes do not silently redirect an active observer.

In an owned two-process fixture, stopping the compiled observer left the producer able to write and finish. That proves the tested file-observation separation—not live Pi/Herdr freshness, active branches, zero overhead or OS containment. Deployment and content policy remain explicit operator responsibilities.
