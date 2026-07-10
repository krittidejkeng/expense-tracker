# WSGI adapter for PythonAnywhere (its servers speak WSGI; FastAPI is ASGI).
from a2wsgi import ASGIMiddleware
from main import app

application = ASGIMiddleware(app)
