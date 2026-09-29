"""Request-owned cooperative cancellation; never a promise of refunded inference."""
from contextvars import ContextVar
from threading import Lock

CANCEL = ContextVar("ariadne_execution_cancellation", default=None)


class ExecutionCancelled(ConnectionAbortedError):
    pass


class Cancellation:
    def __init__(self, disconnected=None):
        self._lock, self._cancelled, self._callbacks = Lock(), False, set()
        self.disconnected = disconnected

    def check(self):
        if self.disconnected and self.disconnected(): self.cancel()
        with self._lock: cancelled = self._cancelled
        if cancelled: raise ExecutionCancelled("EXECUTION_CANCELLED")

    def cancel(self):
        with self._lock:
            if self._cancelled: return
            self._cancelled = True
            callbacks, self._callbacks = tuple(self._callbacks), set()
        for callback in callbacks:
            try: callback()
            except Exception: pass  # Cleanup cannot turn a cancellation into a retry.

    def register(self, callback):
        with self._lock:
            cancelled = self._cancelled
            if not cancelled: self._callbacks.add(callback)
        if cancelled: callback()
        def remove():
            with self._lock: self._callbacks.discard(callback)
        return remove


def check_cancelled():
    state = CANCEL.get()
    if state is not None: state.check()


def socket_cancellation(connection):
    """Observe loopback peer closure without consuming request bytes or a new thread."""
    import select
    import socket
    def disconnected():
        try:
            if select.select([connection], [], [], 0)[0]:
                return not connection.recv(1, socket.MSG_PEEK | socket.MSG_DONTWAIT)
        except (BlockingIOError, InterruptedError): pass
        except OSError: return True
        return False
    return Cancellation(disconnected if connection is not None else None)
