FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Устанавливаем все зависимости, включая devDependencies
RUN npm install

COPY . .

RUN npm run build

# Можно удалить devDependencies после сборки, если хочется оптимизировать размер
RUN npm prune --production

EXPOSE 8000

CMD ["npm", "start"]
