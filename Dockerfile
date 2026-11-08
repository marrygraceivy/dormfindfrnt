FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG VITE_API_BASE=https://dormfindbackend-production.up.railway.app/api
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm run build

FROM node:22-alpine

WORKDIR /app

RUN npm install -g serve@14

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT:-3000}"]
