# Production deployment

## Требования

- Linux-сервер с Docker Engine и Docker Compose.
- Домен с A/AAAA-записью на сервер.
- Открытые входящие порты 80 и 443.
- Длинные случайные значения пароля PostgreSQL и `METRICS_TOKEN`.

## Настройка

1. Скопировать `.env.production.example` в `.env.production`.
2. Указать `DOMAIN`, PostgreSQL credentials, `DATABASE_URL` и `METRICS_TOKEN`.
3. Специальные символы пароля внутри `DATABASE_URL` кодировать как URL.
4. Не добавлять `.env.production` в Git.

## Запуск

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.yml up -d --build
```

Caddy автоматически получает и обновляет HTTPS-сертификаты после настройки DNS. API применяет committed Prisma migrations до запуска. PostgreSQL, API и web имеют Docker healthchecks; Caddy ждёт готовности web и API.

## Проверка

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.yml ps
curl -fsS https://YOUR_DOMAIN/api/health/live
curl -fsS https://YOUR_DOMAIN/api/health/ready
curl -fsS -H "Authorization: Bearer YOUR_METRICS_TOKEN" https://YOUR_DOMAIN/api/metrics
```

- `/api/health/live` проверяет процесс.
- `/api/health/ready` проверяет PostgreSQL и доступность каталогов аватаров и вложений для записи.
- `/api/metrics` отдаёт Prometheus-формат и в production защищён bearer-токеном.
- Каждый HTTP-ответ содержит `X-Request-Id`.

## Логи и оповещения

В production NestJS пишет однострочные JSON-логи без body, cookies и паролей. Docker использует драйвер `local` с ротацией: до пяти файлов по 10 МБ на сервис.

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.yml logs -f --tail=200 api
```

Проверка readiness вручную:

```bash
set -a
. ./.env.production
set +a
./infra/monitor.sh
```

Для webhook-уведомления установить `ALERT_WEBHOOK_URL`. Пример cron каждые пять минут:

```cron
*/5 * * * * cd /opt/vocreborn && set -a && . ./.env.production && set +a && ALERT_WEBHOOK_URL=https://YOUR_WEBHOOK ./infra/monitor.sh >> /var/log/vocreborn-monitor.log 2>&1
```

Prometheus/Loki/Sentry подключаются к подготовленным метрикам и JSON stdout после выбора инфраструктуры владельцем.

## Резервные копии

Скрипт сохраняет PostgreSQL, аватары и вложения и SHA-256 manifest:

```bash
./infra/backup.sh ./backups
```

Копировать три созданных файла во внешнее хранилище, не расположенное на сервере приложения. Каталог `backups/` исключён из Git.

Проверка последней копии через восстановление во временную изолированную БД:

```bash
./infra/restore-test.sh ./backups
```

Скрипт проверяет checksums и общий архив медиа, создаёт БД только с префиксом `vocreborn_restore_`, восстанавливает dump, проверяет таблицы и историю Prisma, затем удаляет тестовую БД.

Рекомендуемый cron backup:

```cron
15 2 * * * cd /opt/vocreborn && ./infra/backup.sh /srv/backups/vocreborn >> /var/log/vocreborn-backup.log 2>&1
```

## Обновление

Перед обновлением:

```bash
npm run lint:all
npm run test:integration
./infra/backup.sh ./backups
./infra/restore-test.sh ./backups
```

Затем:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.yml up -d --build
```
