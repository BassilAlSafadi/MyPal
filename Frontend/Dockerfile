# Use a stable Node runtime for development
FROM node:22-bullseye-slim

# Set working directory
WORKDIR /usr/src/app

# Copy dependency manifests first for better caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy the rest of the application source
COPY . .

# Set the host to allow external access from the container
ENV HOST=0.0.0.0

# Expose the Vite and preview ports
EXPOSE 5173 8080

# Start the Vite development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
