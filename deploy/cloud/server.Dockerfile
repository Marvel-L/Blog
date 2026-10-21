FROM golang:1.27.3-alpine3.23 AS build
ARG GOPROXY=https://goproxy.cn,https://proxy.golang.org,direct
WORKDIR /src
COPY packages/server/go.mod packages/server/go.sum ./
RUN go mod download
COPY packages/server/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /dblog-server ./cmd/server

FROM scratch
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /dblog-server /app/dblog-server
USER 10001:10001
EXPOSE 3001
ENTRYPOINT ["/app/dblog-server"]
CMD ["serve"]
