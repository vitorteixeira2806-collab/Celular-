"""Cliente mínimo da fila do fal.ai (queue.fal.run): envia, acompanha e baixa."""
import base64
import mimetypes
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
QUEUE = "https://queue.fal.run"


def load_key():
    key = os.environ.get("FAL_KEY")
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text().splitlines():
            if line.strip().startswith("FAL_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        sys.exit("FAL_KEY não encontrada (.env ou variável de ambiente). Parando.")
    return key


def data_uri(path):
    mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    return f"data:{mime};base64," + base64.b64encode(Path(path).read_bytes()).decode()


def run(model, payload, poll=5, timeout=900):
    """Submete na fila e espera o resultado. Retorna o JSON de resposta."""
    headers = {"Authorization": f"Key {load_key()}", "Content-Type": "application/json"}
    r = requests.post(f"{QUEUE}/{model}", json=payload, headers=headers, timeout=120)
    r.raise_for_status()
    job = r.json()
    status_url, response_url = job["status_url"], job["response_url"]
    print(f"  [{model}] request_id={job['request_id']}", flush=True)
    start = time.time()
    while True:
        s = requests.get(status_url, headers=headers, timeout=60).json()
        if s.get("status") == "COMPLETED":
            break
        if time.time() - start > timeout:
            sys.exit(f"Timeout aguardando {job['request_id']}")
        time.sleep(poll)
    r = requests.get(response_url, headers=headers, timeout=120)
    r.raise_for_status()
    return r.json()


def download(url, dest):
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    return dest
