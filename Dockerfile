FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

RUN if [ "$NODE_ENV" = "production" ]; then \
      npm run build && npm prune --production; \
    else \
      echo "Dev mode: skip build/prune in image"; \
    fi

EXPOSE 8000

CMD ["npm", "start"]
