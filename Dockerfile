FROM pulumi/pulumi
LABEL authors="fcruxen"
WORKDIR /usr/src/infra
COPY . .
RUN yarn
ENTRYPOINT ["pulumi preview"]
