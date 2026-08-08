#!/bin/bash
# install.sh — One-command setup for any HPC user
# Usage: bash install.sh

set -e

APP_DIR="$HOME/ondemand/dev/job_monitor"
echo "📦 Installing HPC Job Monitor..."

# Copy app to OOD dev directory
mkdir -p "$HOME/ondemand/dev"
if [ -d "$APP_DIR" ]; then
  echo "⚠️  Removing existing installation..."
  rm -rf "$APP_DIR"
fi

# Copy from wherever this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp -r "$SCRIPT_DIR" "$APP_DIR"
rm -f "$APP_DIR/install.sh"  # Don't need installer in the installed copy

# Install Node dependencies
cd "$APP_DIR"
echo "📥 Installing dependencies..."
npm install --production 2>&1 | tail -1

# Make scripts executable
chmod +x bin/node check_jobs.sh

# Setup cron for push notifications
NTFY_TOPIC="hpc-jobs-$(whoami)"
CRON_LINE="*/5 * * * * NTFY_TOPIC=${NTFY_TOPIC} ${APP_DIR}/check_jobs.sh"

if crontab -l 2>/dev/null | grep -q "check_jobs.sh"; then
  echo "⏰ Cron job already exists, skipping."
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "⏰ Cron job added (checks every 5 min)."
fi

echo ""
echo "✅ Done! Here's what to do next:"
echo ""
echo "🖥️  Dashboard: Go to OOD → Develop → HPC Job Monitor"
echo "📱 Phone notifications: Open https://ntfy.sh/${NTFY_TOPIC} on your phone"
echo "   Or install the ntfy app and subscribe to: ${NTFY_TOPIC}"
echo ""
