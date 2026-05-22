# Интеграционные правки

## Изменённые файлы

- `src/App.js` – подключены новые компоненты для пользовательских заявок, добавлены состояния, кнопка для открытия панели отправки, слой предпросмотра и условный рендеринг `SubmissionPanel`.
- `src/App.css` – добавлены стили для кнопки «Предложить правку», панели отправки, таблицы соответствия атрибутов и навигации.
- `src/components/SubmissionPanel.jsx` – новый компонент‑мастер: загрузка GeoJSON, выбор полей названия/описания/типа, предпросмотр на карте, отправка заявки и вывод `submissionId`/`pullRequestUrl`.
- `src/components/GeoJsonImportStep.jsx` – компонент для загрузки и валидации GeoJSON (размер ≤ 2 МБ, тип – `FeatureCollection`, ≤ 10 объектов).
- `src/components/AttributeMappingTable.jsx` – компонент для отображения свойств объектов и выбора полей `name`, `explainer`, типа.
- `src/components/SubmissionPreviewLayer.jsx` – компонент для показа загруженных пользователем объектов на карте в отдельном слое.
- `src/utils/submissionValidation.js` – функции проверки размера файла, структуры GeoJSON, количества объектов и обязательных полей.
- `src/utils/geojsonImport.js` – функции чтения JSON, извлечения ключей свойств, подготовки таблицы, нормализации объектов и определения целевого слоя по геометрии.
- `src/utils/submissionApi.js` – отправка заявки на backend по адресу из `REACT_APP_SUBMISSIONS_API_URL`; обработка ошибок.
- `worker/src/index.js` – поддержка нескольких Origins (из переменной `ALLOWED_ORIGINS`), динамический заголовок CORS, путь к GeoJSON строится по схеме `public/data/{layer}.geojson` для `points`, `lines`, `districts`.
- `worker/src/validateSubmission.js` – унифицированы значения `targetLayer` (`points`, `lines`, `districts`); проверяется соответствие геометрии и указанного слоя.
- `worker/src/response.js` – заголовок `Access‑Control‑Allow‑Origin` определяется динамически; используется первый адрес из `ALLOWED_ORIGINS` или `env.__response_origin`.
- `worker/wrangler.toml` – заменена переменная `ALLOWED_ORIGIN` на `ALLOWED_ORIGINS` и перечислены допустимые Origins: `http://localhost:3000,https://terracodingzavr.github.io`.
- `worker/README.md` – добавлены инструкции по локальному запуску, добавлению секрета, деплою Worker, настройке CORS и взаимодействию с фронтендом.

## Что исправлено

1. Реализована первая итерация пользовательских заявок: загрузка GeoJSON‑файла, выбор полей, предпросмотр на карте, формирование и отправка заявки на Cloudflare Worker.
2. Поддержан унифицированный формат `targetLayer` (`points`, `lines`, `districts`), который backend преобразует в соответствующие файлы (`public/data/points.geojson` и т.д.).
3. Исправлена CORS‑логика: список допустимых Origins задаётся через `ALLOWED_ORIGINS`, Origin из запроса проверяется и возвращается в ответах.
4. Валидация заявок на frontend и backend: размеры файлов/тел, ограничение числа объектов, проверка наличия названия и описания, поддержка только типа изменения `create`.
5. Обновлены стили и компоненты React, чтобы новые элементы не ломали существующий интерфейс (карта, легенда, панель о карте).

## Проверка frontend

```bash
cd <путь к проекту>
npm install
npm run build   # сборка production
npm start       # запуск development‑сервера на http://localhost:3000
```

Перед сборкой укажите переменную окружения `REACT_APP_SUBMISSIONS_API_URL`, например:

```bash
export REACT_APP_SUBMISSIONS_API_URL=https://vernacular-map-submissions.<your-subdomain>.workers.dev
```

## Проверка backend (Worker)

```bash
cd worker
npm install
npm run dev      # запускает Worker на http://localhost:8787
curl http://localhost:8787/health
```

Если всё настроено корректно, endpoint `/health` вернёт `{"ok":true,...}`.

## Добавление секрета GitHub бота

Перейдите в каталог `worker` и выполните команду:

```bash
npx wrangler secret put GITHUB_TOKEN
```

При появлении запроса вставьте Personal Access Token GitHub, имеющий права на запись в репозиторий `terracodingzavr/vernacular-map-perm`. Токен хранится на стороне Cloudflare и не попадает в исходный код.

## Деплой Worker

```bash
cd worker
npm run deploy
```

После деплоя Worker будет доступен по адресу `https://<name>.<subdomain>.workers.dev`. Используйте этот адрес для `REACT_APP_SUBMISSIONS_API_URL`.

## Настройка URL для фронтенда

В файле `.env.local` (или через переменную окружения) задайте:

```
REACT_APP_SUBMISSIONS_API_URL=https://vernacular-map-submissions.<your-subdomain>.workers.dev
```

Это URL вашего развернутого Cloudflare Worker. Фронтенд будет отправлять заявки именно на этот адрес.

## Деплой карты на GitHub Pages

```bash
npm run build
npx gh-pages -d build
```

Команда `gh-pages` (при установленном пакете `gh-pages`) публикует содержимое директории `build` на ветке `gh-pages` вашего репозитория, что позволяет обновить GitHub Pages сайт.

---

После распаковки архива замените содержимое вашего локального репозитория файлами из каталога `vernacular-map-perm-fixed/` (не затрагивая скрытые файлы `.git` и ваши локальные настройки) и выполните коммит.