FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Entrypoint materializes the Google service account key from an env var (see
# docker-entrypoint.sh) before handing off to the CMD below.
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "app/server.js"]
