# Proxy de IA alojado (D-103). Construye con docker build -t studiare-ia . y corre con las variables
# de docs/IA_ALOJADA.md. No lleva ninguna llave. Las pone el alojamiento al arrancar.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Solo lo que el proxy importa. La prueba tests/security/hosted-image.test.ts vigila que esta lista alcance
COPY server ./server
COPY prompts ./prompts
COPY src/engines ./src/engines
COPY src/config ./src/config
COPY src/data/schemas/common.ts ./src/data/schemas/common.ts
COPY src/data/cloud/keyRole.ts ./src/data/cloud/keyRole.ts

USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/hosted/main.ts"]
