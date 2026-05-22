Этот каталог содержит Cloudflare Worker, который принимает пользовательские правки для веб‑карты, валидирует их, применяет к GeoJSON‑данным и создаёт Pull Request в репозитории GitHub. Worker поддерживает только операции `create` (создание новых объектов).

## Локальный запуск

Чтобы разработать и протестировать Worker локально, потребуется установленный Node.js и пакет `wrangler`.

1. Перейдите в каталог `worker`:

   ```bash
   cd worker
   ```

2. Установите зависимости:

   ```bash
   npm install
   ```

3. Запустите Worker в режиме разработки:

   ```bash
   npm run dev
   ```

   По умолчанию Worker будет доступен по адресу `http://localhost:8787`. Здоровье сервиса можно проверить запросом:

   ```bash
   curl http://localhost:8787/health
   ```

4. Добавьте секрет с токеном GitHub (требуется для создания Pull Request) отдельно. **Никогда не сохраняйте токен в репозитории.** Выполните команду:

   ```bash
   npx wrangler secret put GITHUB_TOKEN
   ```

   Затем введите токен в интерактивный ввод. Токен должен иметь права на запись в репозиторий `terracodingzavr/vernacular-map-perm`.

5. Чтобы задеплоить Worker в облако Cloudflare, выполните:

   ```bash
   npm run deploy
   ```

## Настройка CORS

В файле `wrangler.toml` переменная `ALLOWED_ORIGINS` содержит список разрешённых Origins через запятую. Например:

```
ALLOWED_ORIGINS = "http://localhost:3000,https://terracodingzavr.github.io"
```

В коде Worker значение Origin извлекается из заголовка запроса и сравнивается с этим списком. Для локальной разработки используйте `http://localhost:3000`. Для GitHub Pages — `https://terracodingzavr.github.io`. Браузерный Origin не содержит путь, поэтому не добавляйте `/vernacular-map-perm/`.

## Использование с фронтендом

В корне фронтенд‑проекта установите переменную окружения `REACT_APP_SUBMISSIONS_API_URL`, указывающую на публичный URL Worker. Пример для продакшна:

```
REACT_APP_SUBMISSIONS_API_URL=https://vernacular-map-submissions.<your-subdomain>.workers.dev
```

Это значение используется React‑приложением для отправки пользовательских заявок.

## Обработка заявок

Схема работы:

```
GitHub Pages фронтенд → Cloudflare Worker endpoint → GitHub API через env.GITHUB_TOKEN → Pull Request от имени бота
```

Worker принимает POST запросы на `/api/submissions`, валидирует содержимое, сохраняет заявку в каталоге `submissions/pending`, применяет изменения к соответствующим GeoJSON‑файлам (`public/data/points.geojson`, `public/data/lines.geojson`, `public/data/districts.geojson`), создаёт новую ветку `submission/<submissionId>` и открывает Pull Request в основную ветку репозитория.