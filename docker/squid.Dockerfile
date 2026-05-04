FROM ubuntu/squid:7.2-26.04_edge
ADD docker/squid.conf /etc/squid/squid.conf
ADD docker/acl /etc/squid/acl
