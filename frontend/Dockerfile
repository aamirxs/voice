# Build Stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# We accept the socket URL as an argument during the build process
ARG VITE_SOCKET_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
RUN npm run build

# Production Stage - Nginx
FROM nginx:alpine
# Copy the built React app to Nginx's web folder
COPY --from=builder /app/dist /usr/share/nginx/html
# Include a custom Nginx config for React Router fallback
RUN echo "server { listen 80; location / { root /usr/share/nginx/html; index index.html; try_files \$uri \$uri/ /index.html; } }" > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
