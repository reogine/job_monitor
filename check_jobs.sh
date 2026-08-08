#!/bin/bash
# check_jobs.sh — Cron script that detects job state changes and sends push via ntfy.sh
# Usage: */5 * * * * ~/job_monitor/check_jobs.sh

NTFY_TOPIC="${NTFY_TOPIC:-hpc-jobs-$(whoami)}"
STATE_FILE="$HOME/.job_monitor_state"
CURRENT=$(mktemp)

# Get current jobs
squeue -u "$(whoami)" -o "%i|%j|%T" --noheader 2>/dev/null | sort > "$CURRENT"

# First run — just save state
if [ ! -f "$STATE_FILE" ]; then
  cp "$CURRENT" "$STATE_FILE"
  rm "$CURRENT"
  exit 0
fi

# Find jobs that disappeared (finished/failed/cancelled)
while IFS='|' read -r id name state; do
  if ! grep -q "^${id}|" "$CURRENT" 2>/dev/null; then
    curl -s -d "Job ${id} (${name}) finished (was ${state})" \
      "https://ntfy.sh/${NTFY_TOPIC}" \
      -H "Title: HPC Job Finished" \
      -H "Tags: white_check_mark" > /dev/null 2>&1
  fi
done < "$STATE_FILE"

# Find jobs that started running
while IFS='|' read -r id name state; do
  if [ "$state" = "RUNNING" ]; then
    old_state=$(grep "^${id}|" "$STATE_FILE" 2>/dev/null | cut -d'|' -f3)
    if [ -n "$old_state" ] && [ "$old_state" != "RUNNING" ]; then
      curl -s -d "Job ${id} (${name}) is now RUNNING" \
        "https://ntfy.sh/${NTFY_TOPIC}" \
        -H "Title: HPC Job Started" \
        -H "Tags: rocket" > /dev/null 2>&1
    fi
  fi
done < "$CURRENT"

# Update state
cp "$CURRENT" "$STATE_FILE"
rm "$CURRENT"
