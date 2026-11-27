#!/usr/bin/env python3
"""S.E.A.-L.I.O.N. - Real-Time ROV Sensor Telemetry Streamer CLI.

Simulates physics-correlated sensor packets (depth, hydrostatic pressure,
piezo-acoustic leak hiss, battery discharge, thruster RPM) and streams them
live to the AWS HTTP API (`POST /api/telemetry/ingest`) or local development server.

Usage:
    python scripts/stream_telemetry.py --api-base https://your-api.execute-api.ap-south-1.amazonaws.com
    python scripts/stream_telemetry.py --api-base http://localhost:3000 --interval 1.5
"""
import argparse
import json
import math
import sys
import time
import urllib.error
import urllib.request

ATMOSPHERIC_PRESSURE_KPA = 101.325
WATER_DENSITY_KG_M3 = 997.0
GRAVITY_M_S2 = 9.81


def compute_pressure_kpa(depth_m: float) -> float:
    return ATMOSPHERIC_PRESSURE_KPA + (WATER_DENSITY_KG_M3 * GRAVITY_M_S2 * max(0.0, depth_m)) / 1000.0


def simulate_packet(step: int, unit_id: str, battery_start: float = 98.0) -> dict:
    t = step * 0.15
    # Smooth sinusoidal dive pattern between 0.2m and 3.8m
    depth_m = round(2.0 + 1.8 * math.sin(t * 0.5), 2)
    pressure_kpa = round(compute_pressure_kpa(depth_m), 2)

    # Acoustic leak score peaks near 2.6m depth (simulating passing by crack C-03 leak)
    leak_dist = abs(depth_m - 2.6)
    acoustic_score = int(round(10.0 + 85.0 * math.exp(-(leak_dist ** 2) / 0.35)))
    acoustic_score = max(5, min(100, acoustic_score))

    # Thruster RPM correlates with vertical velocity
    velocity = math.cos(t * 0.5)
    thruster_rpm = int(round(600 + abs(velocity) * 950))

    # Slow battery discharge (0.02% per step)
    battery_pct = max(10, int(round(battery_start - step * 0.02)))

    return {
        "unit_id": unit_id,
        "depth_m": depth_m,
        "pressure_kpa": pressure_kpa,
        "acoustic_leak_index": acoustic_score,
        "battery_pct": battery_pct,
        "thruster_rpm": thruster_rpm,
    }


def post_telemetry(endpoint: str, packet: dict) -> tuple[int, str]:
    payload = json.dumps(packet).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")
    except Exception as e:
        return 0, str(e)


def main():
    parser = argparse.ArgumentParser(description="Stream S.E.A.-L.I.O.N. sensor packets to AWS API")
    parser.add_argument(
        "--api-base",
        default="http://localhost:3000",
        help="Base URL for Sea Lion API (e.g. https://xyz.execute-api.ap-south-1.amazonaws.com)",
    )
    parser.add_argument("--unit-id", default="sealion-rov-01", help="ROV Unit Identifier")
    parser.add_argument("--interval", type=float, default=2.0, help="Stream interval in seconds")
    parser.add_argument("--count", type=int, default=0, help="Number of packets (0 = infinite)")

    args = parser.parse_args()
    clean_base = args.api_base.rstrip("/")
    endpoint = f"{clean_base}/api/telemetry/ingest"

    print("=" * 70)
    print("S.E.A.-L.I.O.N. - Real-Time ROV Sensor Telemetry Streamer")
    print(f"Target Endpoint: {endpoint}")
    print(f"ROV Unit:        {args.unit_id}")
    print(f"Poll Interval:   {args.interval}s")
    print("=" * 70)

    step = 0
    try:
        while True:
            packet = simulate_packet(step, args.unit_id)
            status_code, resp_text = post_telemetry(endpoint, packet)

            status_indicator = (
                "\033[92m[200 OK]\033[0m"
                if status_code == 200
                else f"\033[91m[{status_code} ERR]\033[0m"
            )

            leak_flag = ""
            if packet["acoustic_leak_index"] >= 65:
                leak_flag = " | \033[91m[CRITICAL LEAK HISS]\033[0m"
            elif packet["acoustic_leak_index"] >= 35:
                leak_flag = " | \033[93m[ELEVATED HISS]\033[0m"

            print(
                f"#{step:04d} {status_indicator} "
                f"Depth: {packet['depth_m']:4.2f}m | "
                f"Press: {packet['pressure_kpa']:6.2f}kPa | "
                f"Acoustic: {packet['acoustic_leak_index']:3d}/100 | "
                f"Bat: {packet['battery_pct']:2d}% | "
                f"RPM: {packet['thruster_rpm']:4d}"
                f"{leak_flag}"
            )

            step += 1
            if args.count > 0 and step >= args.count:
                print(f"\nCompleted {args.count} packets. Stream finished.")
                break

            time.sleep(args.interval)

    except KeyboardInterrupt:
        print("\nTelemetry stream stopped by operator.")
        sys.exit(0)


if __name__ == "__main__":
    main()
