from flask import Flask
from flask_cors import CORS
from config import SECRET_KEY
from routes.auth import auth_bp
from routes.budgets import budgets_bp
from routes.notifications import notifications_bp

app = Flask(__name__)
app.secret_key = SECRET_KEY

# Allow the static frontend (opened as file://) and common dev origins
CORS(
    app,
    supports_credentials=True,
    origins=["http://localhost:3000", "http://127.0.0.1:3000", "null", ""],
)

app.register_blueprint(auth_bp,           url_prefix="/api/auth")
app.register_blueprint(budgets_bp,        url_prefix="/api")
app.register_blueprint(notifications_bp,  url_prefix="/api")


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
