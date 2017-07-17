FROM node:8

# Configure timezone
ENV TZ=America/Santiago
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

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
