FROM node:20-alpine

RUN apk add --no-cache tzdata
ENV TZ=Asia/Kolkata

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install --production

COPY . .

RUN chmod +x start.sh

EXPOSE 5000

CMD ["sh", "start.sh"]
