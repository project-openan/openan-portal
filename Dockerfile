# syntax=docker/dockerfile:1
# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
#    Licensed under the Apache License, Version 2.0 (the "License"); you may
#    not use this file except in compliance with the License. You may obtain
#    a copy of the License at
#
#         http://www.apache.org/licenses/LICENSE-2.0
#
#    Unless required by applicable law or agreed to in writing, software
#    distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
#    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
#    License for the specific language governing permissions and limitations
#    under the License.
#
# OpenAN Portal container image.
#
# The Portal is a pure frontend SPA: this image builds the static output
# (portal/dist/, source-mode plugins compiled in) and serves it with nginx.
# nginx runs as an unprivileged user (uid 101, arbitrary-UID tolerant for
# OpenShift's restricted SCC), listening on port 8080. Backend endpoints
# default to the in-cluster service names (see 15-openan-backends.envsh)
# and can be overridden at container start:
#
#   docker build -t openan-portal .
#   docker run -p 8080:8080 openan-portal                       # in-cluster defaults
#   docker run -p 8080:8080 \
#       -e BACKEND_HOST=192.168.1.10 -e REGISTRY_HOST=192.168.1.11 \
#       openan-portal                                           # component override
#   docker run -p 8080:8080 \
#       -e REGISTRY_URL=http://registry-host:5000 \
#       -e BACKEND_URL=http://orchestrate-host:5001 \
#       openan-portal                                           # full URL override

# ---- Build stage: compile the Portal SPA (Vite 8 requires Node >= 20.19) ----
FROM node:22-alpine AS build
WORKDIR /app

# Discover workspaces from the actual tree; independently-built bundles are
# staged in portal/public/plugins before docker build (see plugins:install).
COPY . .
RUN npm ci && npm run build:release

# ---- Runtime stage: nginx serves the static output ----
# Runs as the nginx user (uid 101) with arbitrary-UID (GID 0) tolerance,
# as enforced by OpenShift's restricted SCC; nginx listens on 8080.
FROM nginx:1.27-alpine

COPY --from=build /app/portal/dist /usr/share/nginx/html

# envsubst template: rendered to /etc/nginx/conf.d/default.conf at container
# start, substituting ${REGISTRY_URL} and ${BACKEND_URL} from the environment.
COPY default.conf.template /etc/nginx/templates/default.conf.template

COPY 15-openan-backends.envsh /docker-entrypoint.d/15-openan-backends.envsh

# sed strips CR in case of a CRLF (Windows) checkout; the nginx entrypoint
# only sources executable *.envsh files.
RUN sed -i 's/\r$//' /docker-entrypoint.d/15-openan-backends.envsh \
    && chmod 0755 /docker-entrypoint.d/15-openan-backends.envsh


RUN sed -i 's/^user /#user /' /etc/nginx/nginx.conf \
    && touch /var/run/nginx.pid \
    && chown -R 101:0 /var/cache/nginx /var/run/nginx.pid /etc/nginx \
    && chmod -R g+w /var/cache/nginx /var/run/nginx.pid /etc/nginx
USER 101

# Backend endpoint components; defaults match the in-cluster service names.
ENV REGISTRY_HOST=registry-center \
    REGISTRY_PORT=5000 \
    REGISTRY_SCHEME=http \
    BACKEND_HOST=orchestration-center \
    BACKEND_PORT=5001 \
    BACKEND_SCHEME=http \
    OBSERVATION_HOST=observation-center \
    OBSERVATION_PORT=5002 \
    OBSERVATION_SCHEME=http

EXPOSE 8080
