#!/bin/sh

# Environment MTX_PATH is provided by MediaMTX (e.g. "1/2")
CAM_PATH="${MTX_PATH:-$1}"

if [ -z "$CAM_PATH" ]; then
  echo "[Timelapse] Error: MTX_PATH is not specified!" >&2
  exit 1
fi

# Detect base dir: if /timelapse exists use it, otherwise use ./timelapse
if [ -d "/timelapse" ]; then
  BASE_DIR="/timelapse"
else
  BASE_DIR="$(pwd)/timelapse"
fi

OUT_DIR="${BASE_DIR}/${CAM_PATH}"
LOG_FILE="${BASE_DIR}/timelapse.log"
mkdir -p "$OUT_DIR"

log_msg() {
  local line="[Timelapse] [$(date '+%Y-%m-%d %H:%M:%S')] [${CAM_PATH}] $1"
  echo "$line"
  echo "$line" >> "$LOG_FILE" 2>/dev/null
}

capture_frame() {
  local timestamp
  timestamp="$(date +%Y-%m-%d_%H-%M-%S)"
  local outfile="${OUT_DIR}/${timestamp}.jpg"
  local tmpfile="${OUT_DIR}/.tmp_${timestamp}.jpg"
  local errfile="${OUT_DIR}/.err_${timestamp}.log"

  log_msg "Capturing frame..."

  # Try RTSP first via MediaMTX loopback (port 8554)
  if ffmpeg -y -loglevel error -rtsp_transport tcp -i "rtsp://127.0.0.1:8554/${CAM_PATH}" -vframes 1 -q:v 2 "$tmpfile" 2>"$errfile"; then
    if [ -s "$tmpfile" ]; then
      mv "$tmpfile" "$outfile"
      rm -f "$errfile"
      log_msg "OK: Frame saved to ${outfile}"
      return 0
    fi
  fi

  local rtsp_err
  rtsp_err="$(tr '\n' ' ' < "$errfile" 2>/dev/null)"
  log_msg "RTSP failed (${rtsp_err}), trying HLS fallback..."

  # Fallback to HLS loopback (port 8888)
  if ffmpeg -y -loglevel error -i "http://127.0.0.1:8888/${CAM_PATH}/index.m3u8" -vframes 1 -q:v 2 "$tmpfile" 2>"$errfile"; then
    if [ -s "$tmpfile" ]; then
      mv "$tmpfile" "$outfile"
      rm -f "$errfile"
      log_msg "OK: Frame saved (via HLS) to ${outfile}"
      return 0
    fi
  fi

  local hls_err
  hls_err="$(tr '\n' ' ' < "$errfile" 2>/dev/null)"
  rm -f "$tmpfile" "$errfile"
  log_msg "ERROR: Both RTSP and HLS capture failed. HLS error: ${hls_err}"
  return 1
}

# 1. Capture an initial frame immediately when timelapse is activated
capture_frame

# 2. Loop every hour, precisely at :00:00
while true; do
  NOW=$(date +%s)
  # Calculate seconds remaining until the next full hour (XX:00:00)
  SLEEP_SEC=$(( 3600 - (NOW % 3600) ))
  [ "$SLEEP_SEC" -le 0 ] && SLEEP_SEC=3600

  log_msg "Next capture in ${SLEEP_SEC}s (at :00:00)"
  sleep "$SLEEP_SEC"

  capture_frame
done
