"""HTTP service for a fixed local address, with no DNS dependency at startup."""
from http.server import ThreadingHTTPServer
from socketserver import TCPServer


class LoopbackHTTPServer(ThreadingHTTPServer):
    def server_bind(self):
        # HTTPServer.server_bind calls getfqdn even for 127.0.0.1. A local
        # workspace needs no reverse DNS and must start when the resolver stalls.
        if self.server_address[0] != "127.0.0.1":
            raise ValueError("Ariadne local service requires 127.0.0.1")
        TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]
