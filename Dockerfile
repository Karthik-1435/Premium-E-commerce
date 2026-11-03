FROM node as firststage
WORKDIR /myapp/module/pro
MAINTAINER Dudekula Karthik
LABEL this is a e-commerce page
COPY package*.json .
COPY index.js .
RUN npm install
EXPOSE 3000

FROM firststage as final
RUN npm install --production
COPY . .
CMD ["node","index.js"]


