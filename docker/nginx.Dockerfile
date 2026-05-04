FROM nginx:stable-alpine3.21-perl
ADD docker/nginx.docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ADD docker/nginx.conf /etc/nginx/nginx.conf.template

RUN mkdir -p /var/run/nginx && chown -R nginx:nginx /var/run/nginx
RUN chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/ && \
    chmod +x /usr/local/bin/docker-entrypoint.sh

# Switch to the non-root user
USER nginx

# Final entrypoint and command
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
