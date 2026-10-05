FROM node:22-alpine
WORKDIR /app
COPY package.json game.js ai.js server.js ./
COPY public ./public
ENV PORT=3187 HOST=0.0.0.0 DATA_FILE=/data/rooms.json
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 3187
CMD ["node", "server.js"]
