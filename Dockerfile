# ── Build stage: just validate/organise assets ───────────────
# (No build tool needed — pure HTML/CSS/JS)
# Using nginx:alpine for minimal footprint

FROM nginx:1.27-alpine

# Remove default nginx config and content
RUN rm -rf /etc/nginx/conf.d/default.conf \
           /usr/share/nginx/html/*

# Copy our nginx config
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy static site files
COPY html/ /usr/share/nginx/html/

# nginx runs as non-root for safety
RUN chown -R nginx:nginx /usr/share/nginx/html \
    && chmod -R 755 /usr/share/nginx/html

EXPOSE 80

# Use the default nginx entrypoint / CMD (runs in foreground)
