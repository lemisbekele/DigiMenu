# ---------- Build stage ----------
# VITE_* variables are baked into the bundle at BUILD time. They are passed
# in as build args (see docker-compose.yml, sourced from .env).
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_VAPID_PUBLIC_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY

RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
