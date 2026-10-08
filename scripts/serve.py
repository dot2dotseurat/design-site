#!/usr/bin/env python3
"""Local server for the mood board with a Hide button that saves into data.json.

  python3 scripts/serve.py            # then open http://localhost:8000

The Hide / Unhide buttons only appear when this server is running (the page checks /api/ping),
so the published static site stays read-only. Hiding sets `hidden: true` on the item in data.json.
"""
import json, pathlib, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'data.json'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split('?')[0] == '/api/ping':
            return self._json(200, {'ok': True})
        super().do_GET()

    def do_POST(self):
        if self.path != '/api/hide':
            return self._json(404, {'error': 'not found'})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
            data = json.loads(DATA.read_text())
            item = next(i for i in data['items'] if i['id'] == req['id'])
        except (StopIteration, KeyError, ValueError):
            return self._json(400, {'error': 'unknown item'})
        if req.get('hidden'):
            item['hidden'] = True
        else:
            item.pop('hidden', None)
        DATA.write_text(json.dumps(data, indent=1, ensure_ascii=True) + '\n')
        self._json(200, {'id': item['id'], 'hidden': bool(item.get('hidden'))})


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'Serving {ROOT} at http://localhost:{port} (Hide buttons enabled)')
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
