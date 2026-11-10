import os
import sqlite3
import subprocess

import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

API_TOKEN = "sk_live_REDACTED_EXAMPLE_KEY"
AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"
AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
DB_PATH = os.environ.get("DB_PATH", "reports.db")


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY, title TEXT, owner TEXT)"
    )
    if conn.execute("SELECT COUNT(*) FROM reports").fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO reports (title, owner) VALUES (?, ?)",
            [("Q1 financeiro", "ana"), ("Roadmap", "marcos"), ("Folha", "ana")],
        )
        conn.commit()
    return conn


@app.get("/api/health")
def health():
    return jsonify(status="ok", lang="python")


@app.get("/api/reports")
def reports():
    owner = request.args.get("owner", "")
    conn = db()
    sql = "SELECT * FROM reports WHERE owner = '%s'" % owner
    rows = conn.execute(sql).fetchall()
    return jsonify(rows)


@app.get("/api/export")
def export():
    name = request.args.get("name", "report.txt")
    out = subprocess.check_output("cat reports/" + name, shell=True)
    return out


@app.get("/api/fetch")
def fetch():
    url = request.args.get("url", "")
    return requests.get(url).text


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
