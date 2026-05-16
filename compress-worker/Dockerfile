FROM node:20-alpine

# ffmpeg + libs necessárias
RUN apk add --no-cache ffmpeg ca-certificates tini

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
