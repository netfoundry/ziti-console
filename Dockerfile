FROM node:13.7

# Create app directory
WORKDIR /usr/src/app

# Expose ports
EXPOSE 1408
EXPOSE 1080

# Copy source code to image
COPY . .

# Fetch dependencies
RUN yarn clean
RUN yarn 

RUN chmod +x /usr/src/app/run.sh

# Build app and start server from script
CMD ["/usr/src/app/run.sh"]
