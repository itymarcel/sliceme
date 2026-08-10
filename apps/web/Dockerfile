FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
ENV SLICER_API_HOST=slicer-api \
    SLICER_API_PORT=8080 \
    NGINX_ENVSUBST_FILTER='^SLICER_API_'
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
