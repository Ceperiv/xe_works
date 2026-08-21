FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json tsconfig.build.json jest.config.ts ./
COPY src ./src
COPY mock-publisher ./mock-publisher
COPY test ./test

RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY mock-publisher ./mock-publisher

CMD ["node", "dist/main.js"]
