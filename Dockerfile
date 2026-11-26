FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
COPY vendor ./vendor
ENV HOST=0.0.0.0
CMD ["node", "server.mjs"]
