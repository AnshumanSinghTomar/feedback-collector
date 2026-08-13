FROM node:20-slim

WORKDIR /app

# Manifests first, so dependency install is cached separately from source changes
COPY package.json package-lock.json ./
RUN npm ci

COPY public ./public
COPY src ./src

EXPOSE 3000

# Create React App's dev server. Fine for a demo; a production deploy would
# build to static files and serve them behind nginx instead.
CMD ["npm", "start"]
