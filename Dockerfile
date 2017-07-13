FROM node:8

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json yarn.lock /usr/src/app/
RUN yarn install --pure-lockfile

# Bundle app source
COPY . /usr/src/app

EXPOSE 4000

CMD ["yarn", "start"]
