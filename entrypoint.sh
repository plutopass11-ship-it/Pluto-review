#!/bin/sh

# Ensure the data directory exists and is writable
mkdir -p /app/data
chown -R nextjs:nodejs /app/data
chmod -R 775 /app/data

# Ensure environment files are readable by nextjs user
for env_file in /app/.env*; do
  if [ -f "$env_file" ]; then
    chown nextjs:nodejs "$env_file" 2>/dev/null || true
    chmod 644 "$env_file" 2>/dev/null || true
  fi
done

# Drop to nextjs user and start the app
exec su -s /bin/sh nextjs -c "node server.js"
