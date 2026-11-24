FROM node:20-alpine

WORKDIR /app

# Install production dependencies only (ultra-light ~60MB image for 24/7 Cloud Hosting)
COPY package*.json ./
RUN npm ci --omit=dev

COPY index.mjs ./

# Persistent volume path for WhatsApp Baileys session (creds.json)
ENV NODE_ENV=production
ENV PORT=8080
ENV WA_AUTH_DIR=/data/auth_info

RUN mkdir -p /data/auth_info

EXPOSE 8080

CMD ["node", "index.mjs"]
