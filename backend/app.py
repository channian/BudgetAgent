import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from config import SECRET_KEY
from routes.auth import auth_bp
from routes.budgets import budgets_bp
from routes.notifications import notifications_bp
from routes.users import users_bp

app = Flask(__name__)
app.secret_key = SECRET_KEY

CORS(app, supports_credentials=True)

app.register_blueprint(auth_bp,          url_prefix="/api/auth")
app.register_blueprint(budgets_bp,       url_prefix="/api")
app.register_blueprint(notifications_bp, url_prefix="/api")
app.register_blueprint(users_bp,         url_prefix="/api")

# ── Serve frontend static files ───────────────────────────────────────
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "budget")

@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "AI Agent 預算審核平台.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(FRONTEND_DIR, filename)


# ── SLA scheduler ────────────────────────────────────────────────────
from apscheduler.schedulers.background import BackgroundScheduler
from utils.sla import check_sla_violations

scheduler = BackgroundScheduler()
scheduler.add_job(check_sla_violations, "interval", hours=6, id="sla_check",
                  misfire_grace_time=300)
scheduler.start()


@app.teardown_appcontext
def _shutdown(exc=None):
    if scheduler.running:
        scheduler.shutdown(wait=False)


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
