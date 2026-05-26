#!/bin/sh

# Ensure the data directory exists and is writable
mkdir -p /app/data
chown -R nextjs:nodejs /app/data
chmod -R 775 /app/data

# Drop to nextjs user and start the app
exec su -s /bin/sh nextjs -c "node server.js"
