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

# Themeable config: templates + startup renderer. The nginx base
# image executes /docker-entrypoint.d/*.sh before starting nginx;
# 40-nettools-config.sh renders theme.css/config.js from .env vars
# into /usr/share/nginx/generated/ (served via nginx location).
COPY docker/theme.css.template docker/config.js.template /etc/nginx/nettools-templates/
COPY docker/40-nettools-config.sh /docker-entrypoint.d/40-nettools-config.sh
RUN chmod +x /docker-entrypoint.d/40-nettools-config.sh \
    && mkdir -p /usr/share/nginx/generated

# nginx runs as non-root for safety
RUN chown -R nginx:nginx /usr/share/nginx/html /usr/share/nginx/generated \
    && chmod -R 755 /usr/share/nginx/html

EXPOSE 80

# Use the default nginx entrypoint / CMD (runs in foreground)
