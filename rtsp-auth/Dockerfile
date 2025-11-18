FROM alpine:latest
LABEL authors="Sorat"

# Install dependencies + set timezone
RUN apk add --no-cache tzdata curl ca-certificates && \
    cp /usr/share/zoneinfo/Asia/Bangkok /etc/localtime && \
    echo "Asia/Bangkok" > /etc/timezone && \
    mkdir -p /usr/local/etc/rtsp-auth
