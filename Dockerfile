FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy app files
COPY . .

# Set environment variables
ENV NODE_ENV=production

# Create directory for logs
RUN mkdir -p logs

# Expose the port
EXPOSE 5001

# Start the application
CMD ["node", "src/index.js"] 