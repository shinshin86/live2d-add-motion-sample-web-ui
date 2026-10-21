"""Run with python3 -B tools/test_body_stage.py (no running server needed)."""
import http.client
import http.server
import json
import threading
import unittest
import serve

class StageRelayTest(unittest.TestCase):
    def test_stage_schema(self):
        self.assertTrue(serve.valid_stage_message({'x': .15, 'y': -.08, 'rot': 8}))
        for bad in (None, [], {}, {'x': 0, 'y': 0, 'rot': 0, 'raw': []}):
            self.assertFalse(serve.valid_stage_message(bad))
        for key, bound in (('x', .15), ('y', .08), ('rot', 8)):
            for value in (True, '0', float('nan'), float('inf'), bound+.001, -bound-.001):
                stage = dict(x=0, y=0, rot=0, **{})
                stage[key] = value
                self.assertFalse(serve.valid_stage_message(stage), (key, value))

    def test_http_relay(self):
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), serve.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            message = dict(type='pose', face=None, weight=0, mouth=None)
            for stage, expected in ((None, 204), ({'x': .15, 'y': -.08, 'rot': 8}, 204),
                                    ({'x': .151, 'y': 0, 'rot': 0}, 400),
                                    ({'x': True, 'y': 0, 'rot': 0}, 400),
                                    ({'x': 0, 'y': 0, 'rot': 0, 'landmarks': []}, 400)):
                payload = {**message, **({'stage': stage} if stage is not None else {})}
                connection = http.client.HTTPConnection('127.0.0.1', server.server_port)
                connection.request('POST', '/live/send', json.dumps(payload), {'Content-Type': 'application/json'})
                response = connection.getresponse()
                response.read()
                self.assertEqual(response.status, expected)
                connection.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(2)

if __name__ == '__main__':
    unittest.main()
