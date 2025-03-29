FROM node:22.6.0-alpine

RUN apk add --no-cache python3 py3-pip curl

RUN pip install --break-system-packages --trusted-host pypi.org --trusted-host files.pythonhosted.org \
    duckduckgo_search googlesearch-python

RUN addgroup -S nonroot && adduser -S nonroot -G nonroot

WORKDIR /usr/src/app

COPY package*.json ./

RUN rm -rf node_modules

RUN npm cache clean --force
RUN npm cache verify

RUN npm install --legacy-peer-deps

RUN npm install pm2@latest -g

COPY --chown=nonroot:nonroot . .

RUN mkdir -p logs workspace visualization && chown -R nonroot:nonroot logs workspace visualization

RUN npm run build

USER nonroot

EXPOSE 8080

CMD ["pm2-runtime", "dist/server.js"]
