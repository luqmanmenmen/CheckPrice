FROM node:20-alpine

WORKDIR /app

# Install production dependencies only (ultra-light ~60MB image for 24/7 Cloud Hosting)
COPY package*.json ./
RUN npm ci --omit=dev

COPY index.mjs ./

# Hugging Face Spaces default port is 7860 & runs as non-root UID 1000
ENV NODE_ENV=production
ENV PORT=7860
ENV WA_AUTH_DIR=/data/auth_info

RUN mkdir -p /data/auth_info && chmod -R 777 /data /app

EXPOSE 7860

CMD ["node", "index.mjs"]
