FROM node:24

WORKDIR /app

ARG BUILD_API_KEY=sk-build-secret-abc123
ENV BUILD_API_KEY=${BUILD_API_KEY}

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV DB_ENGINE=mysql
ENV HOST=0.0.0.0
EXPOSE 3001

CMD ["node", "app-vuln/server.js"]
