FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
# O entrypoint da imagem aplica envsubst neste template ao iniciar.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV DNS_RESOLVER=127.0.0.11 \
    TICKET_SERVICE_HOST=ticket-service \
    NOTIFICATION_SERVICE_HOST=notification-service \
    NGINX_ENVSUBST_FILTER="DNS_RESOLVER|TICKET_SERVICE_HOST|NOTIFICATION_SERVICE_HOST"
EXPOSE 8080
