FROM node:24-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --include=dev

COPY . .

RUN npx prisma generate

ENV NODE_ENV=production

EXPOSE 8080

CMD ["npm", "start"]