FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY shared ./shared
COPY public ./public

RUN mkdir -p /data && chown node:node /data
VOLUME /data

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server/index.js"]
