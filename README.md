# CCTV

Веб-приложение на <b>[Bun](https://bun.com/)</b> и <b>[React](https://react.dev/)</b> для систем умного дома.

## Особенности

- Объединение камер в группы
- Вход и регистрация на смартфонах по QR коду
- Чат-бот Telegram для управления
- Работает с <b>[MediaMTX](https://github.com/bluenviron/mediamtx)</b>
- Для участников: установка имени и аватара, просмотр сессий

## Запуск

Предварительно необходимо установить и запустить сервис MediaMTX

```bash
$ scp -r ./ admin:pass@server:/opt/cctv
cd api
bun i
cd ../bot
bun i
```

Также настроить `.env` (есть `.env.example` на который нужно ориентироваться)  
docker-compose не настроен, потому что не было необходимости (у автора сервер на 500Мб :) )

### Использование бота
Бот <b>переписывается</b> и частично готов (осталось добавить контроль пользователей)  
На данный момент можно посмотреть список групп, камер, создать приглашение и создавать/удалять камеры,
данного функционала достаточно для добавления пользователей и настройки камер.

### Добавление камеры
Проект ориентирован на приватность, поэтому логично предположить, что добавляемая камера
будет недоступна в интернете по прямой ссылке.  
Если камеры расположены в домашней локальной сети за NAT (серый IP), то можно пробросить <b>WireGuard VPN</b>:
1. Установите WireGuard на роутере/устройстве, расположенном в локальной сети, и настройте.
2. Установите WireGuard на сервере, где установлен CCTV API, и свяжите с домашней сетью.
(возможно, придется пробросить/открыть порты на роутере)
3. Узнайте IP адрес камеры и при создании камеры укажите его как источник.  
Камера может работать по прямой ссылке, тогда источник: http://адрес_камеры_wg:554  
Если камера плохо работает по прямой ссылке, то есть имеются ошибки кодировки,
тогда можно в качестве источника указать команду FFMpeg:  
`ffmpeg -rtsp_transport tcp -i http://адрес_камеры_wg:554
-c:v copy -c:a libopus -f rtsp rtsp://techie:@localhost:554/$MTX_PATH`  
Если у камеры нет аудио, `-c:a libopus` указывать не нужно.

### PTZ (поддержка движения)
Можно настроить <b>PTZ</b>.  
Сейчас это трудно сделать (нужно изменить значение столбца media камеры через `sqlite3`/CLI предпочитаемой базы данных),
но в скором времени можно будет через бота.  
Необходимое значение: `[{"type":"hls"},{"type":"ptz"}]`

## Разработка
1. Для локальной разработки нужно поднять <b>[nginx](https://nginx.org/)</b> с самоподписанным SSL-сертификатом, пример конфига:
```nginx
server {
    listen 5000 ssl;
    server_name _;
    
    ssl_certificate     /etc/ssl/certs/localhost.crt;
    ssl_certificate_key /etc/ssl/certs/localhost.key;
    
    location / {
        if ($request_method = OPTIONS) {
                add_header Access-Control-Allow-Origin 'http://localhost:5173' always;
                add_header Access-Control-Allow-Credentials 'true' always;
                add_header Access-Control-Allow-Methods 'GET, POST, PUT, DELETE, OPTIONS, PATCH' alway>
                add_header Access-Control-Allow-Headers 'authorization, content-type' always;
                add_header Content-Length 0;
                add_header Content-Type text/plain;
                return 204;
        }
        
        add_header Cache-Control "no-cache";
        add_header Access-Control-Allow-Origin "http://localhost:5173";
        add_header Access-Control-Allow-Credentials 'true';
        add_header Access-Control-Allow-Methods 'GET, POST, PUT, DELETE, OPTIONS, PATCH';
        add_header Access-Control-Allow-Headers 'authorization, content-type';
        proxy_pass http://localhost:3033/;
        proxy_set_header Host $host;
    }
}
```
2. Сгенерируйте токен доступа для бота (убрав комментарии в index.js для 1 запуска)
3. Укажите токен в `bot/.env`
4. Укажите ссылки и ссылку для параметра cookie в `api/.env`

`api/.env`
```env
SECRET=случайная_длинная_строка
HLS_PATH=https://mediamtx.domain.com/
COOKIE_DOMAIN=.domain.com
```

`bot/.env`
```env
BOT_TOKEN=
SECRET=[token from Tokens table, given by API]
API_ROOT=http://localhost:3033/
ADMIN_ID=[id in CCTV database, not telegram]
```

## В планах

- Восстановление пароля и вход с 2FA
- Создание и контроль приглашений
- Комплексная защита от DDoS
- Светлая тема

## О проекте

Написано с нуля для личного пользования. На разработку ушло около месяца.

Вебдизайн спроектирован мною, реализован Gemini 2.5 Pro
