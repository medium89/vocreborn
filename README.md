# TUSOVA

Рабочий MVP современного чата TUSOVA на Next.js, NestJS, Socket.IO, PostgreSQL и Prisma.

Работают модерируемые изображения и небольшие аудио, сообщения и ветки в профилях, панель администратора, регистрация и HttpOnly-сессии, безопасная смена пароля, редактируемые профили и аватары, публичные комнаты и управление ими, серверные личные сообщения, inbox с непрочитанными, курсорная пагинация истории, реакции и компактные цитируемые ответы с обновлением в реальном времени, присутствие, роли, mute, ban, жалобы, журнал модерации, защита от перебора и спама, а также адаптивный интерфейс.

## Локальный запуск

```bash
npm run db:up
npm run db:migrate
npm run dev:api
```

В отдельном терминале:

```bash
npm run dev
```

Frontend: http://localhost:3000  
API liveness: http://localhost:3001/api/health/live  
API readiness: http://localhost:3001/api/health/ready  
Prometheus metrics: http://localhost:3001/api/metrics

## Тестовые боты

Локально API запускает тестовых ботов только при `TUSOVA_BOTS_ENABLED=true` в `apps/api/.env` (эта настройка уже добавлена в локальный файл и пример). После смены флага перезапустите API. Адресатов личных сообщений и упоминаний можно задать через `TUSOVA_BOT_DIRECT_USERNAME` и `TUSOVA_BOT_MENTION_USERNAME`.

В production Compose боты принудительно отключены. Лучше разворачивать сервер с чистой БД: отключение не удаляет старые сообщения или аккаунты ботов, если восстановить локальную БД.

## Почта и восстановление пароля

Новая регистрация требует e-mail: ссылка подтверждения отправляется в письме. Для ранее созданных аккаунтов адрес можно привязать в разделе «Безопасность» после ввода текущего пароля. На странице `/recover` доступны восстановление по подтверждённой почте и запасной резервный код.

При локальном запуске `npm run db:up` также поднимает Mailpit: письма доступны на `http://localhost:8025`, SMTP — на порту `1025`. В development API использует его по умолчанию. Настоящие письма пользователям локальный Mailpit не доставляет.

Для production задайте `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` в `.env.production` и настройте домен отправителя у выбранного почтового провайдера. Письма отправляются через TLS (порт 465 или STARTTLS); без этих параметров регистрация и почтовое восстановление недоступны.


## Назначение ролей

Роль выдаётся только явной командой с точным логином:

```bash
npm --prefix apps/api run user:role -- <username> <user|moderator|admin>
```

Изменение роли отзывает старые сессии при необходимости; пользователю следует войти снова. Не назначайте `admin` неизвестному аккаунту.

## Проверки

```bash
npm run lint:all
npm run build:all
npm run test:integration
```

## Production

Шаблон окружения: `.env.production.example`. Compose, Caddy и резервное копирование находятся в `infra/`. Полная инструкция — `docs/deployment.md`.

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.yml config
docker compose --env-file .env.production -f infra/docker-compose.prod.yml build
docker compose --env-file .env.production -f infra/docker-compose.prod.yml up -d
```

Не используйте значения секретов из примера в публичной среде.

## Эксплуатация

Production API пишет однострочные JSON-логи с `X-Request-Id`. Docker ограничивает размер локальных логов и проверяет готовность API и web. Метрики в production защищены bearer-токеном из `METRICS_TOKEN`.

```bash
./infra/monitor.sh
./infra/backup.sh
./infra/restore-test.sh backups/<backup-directory>
```

Backup содержит PostgreSQL dump, архив аватаров и вложений и SHA-256 manifest. Подробные команды мониторинга, webhook-оповещений, backup и проверки восстановления приведены в `docs/deployment.md`.

Схема БД находится в `apps/api/prisma/schema.prisma`. Контракт API описан в `docs/api-contract.md`, прогресс — в `ready.md`, очередь — в `todo.md`.
