#!/usr/bin/env python3
"""
ws_probe.py — sonda de integração do WebSocket de telemetria.

Conecta no ESP32 (AP RaposaArtica), coleta amostras do contrato por alguns
segundos e valida: taxa (~10 Hz), chaves do contrato e avanço do timestamp.
Opcionalmente envia um comando (tare/calibrate/freeze) antes de coletar.

Pré-requisitos:
  - O host (Windows/WSL) conectado na rede RaposaArtica.
  - pip install websocket-client

Uso:
  python3 ws_probe.py                 # coleta 3 s e valida
  python3 ws_probe.py --seconds 5
  python3 ws_probe.py --cmd tare      # envia {"cmd":"tare"} e coleta
"""
import argparse
import json
import time

import websocket  # websocket-client

CONTRACT_KEYS = {
    "t", "bx", "by", "bz", "magnitude",
    "inclination", "heading", "calibrated", "calibrating",
}
DEFAULT_URL = "ws://192.168.4.1/ws"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--seconds", type=float, default=3.0)
    ap.add_argument("--cmd", choices=["tare", "calibrate", "freeze"])
    args = ap.parse_args()

    ws = websocket.create_connection(args.url, timeout=5)
    if args.cmd:
        ws.send(json.dumps({"cmd": args.cmd}))
        print(f"-> comando enviado: {args.cmd}")

    msgs, t0 = [], time.time()
    while time.time() - t0 < args.seconds:
        msgs.append(ws.recv())
    ws.close()

    if not msgs:
        print("FALHA: nenhuma mensagem recebida")
        return 1

    rate = len(msgs) / args.seconds
    first, last = json.loads(msgs[0]), json.loads(msgs[-1])
    keys_ok = set(first.keys()) == CONTRACT_KEYS
    t_ok = last["t"] > first["t"]

    print(f"mensagens : {len(msgs)}  (~{rate:.1f} msg/s)")
    print(f"contrato  : {'OK' if keys_ok else 'DIVERGE ' + str(set(first) ^ CONTRACT_KEYS)}")
    print(f"timestamp : {first['t']} -> {last['t']}  {'OK' if t_ok else 'PARADO'}")
    print(f"amostra   : {msgs[-1]}")
    return 0 if (keys_ok and t_ok) else 1


if __name__ == "__main__":
    raise SystemExit(main())
