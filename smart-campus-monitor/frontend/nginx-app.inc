root /usr/share/nginx/html;
index index.html;

# Docker's embedded DNS server
resolver 127.0.0.11 valid=30s;

# Serve static assets directly
location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
}

# Proxy API requests to the backend
location /api/ {
    set $backend "http://backend:5000";
    proxy_pass $backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}

# Proxy Socket.IO websocket and polling requests to the backend
location /socket.io/ {
    # No URI part here: with a variable, a URI replaces the request path AND drops the query string
    # (?EIO=4&transport=...), which made every handshake fail with "Transport unknown".
    set $socket_backend "http://backend:5000";
    proxy_pass $socket_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'Upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}

# SPA routing: serve index.html for all other routes
location / {
    try_files $uri $uri/ /index.html;
}
