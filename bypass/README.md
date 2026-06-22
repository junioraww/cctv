# bypass

В связи с ограничениями иногда приходится настраивать обходы (туннели)

Это примеры, можно использовать что-то одно.

Полезно:

UDP proxying (у меня не работает)
```sh
sudo iptables -t nat -A PREROUTING -p udp --dport 51820 -j DNAT --to-destination 51.91.128.196:51820
sudo iptables -t nat -A POSTROUTING -p udp -d 51.91.128.196 --dport 51820 -j MASQUERADE
```

NGINX proxying (51820 UDP)
```nginx
worker_processes auto;

events {}

stream {
  server {
    listen 51820 udp;
    proxy_pass REMOTE_SERVER:51820;
    proxy_timeout 10s;
  }
}
```

HAPROXY proxying (51821 TCP)
```nginx
global
    log stdout format raw local0
    maxconn 4096

defaults
    log     global
    mode    tcp
    timeout connect 10s
    timeout client  1m
    timeout server  1m

frontend awg_tcp_51821
    bind *:51821
    default_backend awg_tcp_51821_backend

backend awg_tcp_51821_backend
    server awg1 REMOTE_SERVER:51821
```

```sh
sudo docker exec -it amnezia-wg-easy sh
iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 2556 -j DNAT --to-destination 10.8.0.3:2556                                                                                           
iptables -A FORWARD -p tcp -d 10.8.0.3 --dport 2556 -j ACCEPT
```
