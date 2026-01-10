# Digital Arcana - Node.js Development Container
FROM node:20-slim

WORKDIR /app

# Install dependencies for building native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the React client
RUN npm run build

# Expose ports
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
