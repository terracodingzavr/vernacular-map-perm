# Формат пользовательской заявки

Пользовательская заявка отправляется с публичной карты на backend. Backend проверяет данные и создаёт Pull Request в GitHub от имени GitHub-бота.

## Общая схема

Пользователь не авторизуется на GitHub. Он загружает или создаёт данные на карте, после чего frontend отправляет заявку на backend. Backend от имени GitHub-бота создаёт новую ветку и Pull Request в основной репозиторий.

## Ограничения

- Максимальный размер GeoJSON: 2 МБ.
- Максимальное количество объектов в одной заявке: 10.
- Авторизация пользователя на GitHub не требуется.
- Pull Request создаётся от имени GitHub-бота.
- CAPTCHA на первом этапе выключена, но в структуре заявки оставлено поле captchaToken.
- На первом этапе поддерживается только changeType: create.

## Минимальная структура заявки

```json
{
  "submissionId": "sub_2026-05-16_001",
  "source": "public-map",
  "method": "geojson-import",
  "captchaToken": null,
  "author": {
    "displayName": "",
    "contact": ""
  },
  "changes": [
    {
      "changeType": "create",
      "targetLayer": "points",
      "originalFeatureId": null,
      "feature": {
        "type": "Feature",
        "id": "user_feature_001",
        "properties": {
          "name": "Название объекта",
          "explainer": "Описание объекта",
          "Тип названия": "Другое"
        },
        "geometry": {
          "type": "Point",
          "coordinates": [56.25, 58.01]
        }
      }
    }
  ]
}
```

## Обязательные поля

У каждого объекта должны быть:

- geometry;
- properties.name;
- properties.explainer.

Если хотя бы одного из этих полей нет, заявка должна быть отклонена ещё до создания Pull Request.

## Поддерживаемые типы геометрии

- Point;
- MultiPoint;
- LineString;
- MultiLineString;
- Polygon;
- MultiPolygon.

## Поддерживаемые слои

- points — точечные объекты;
- lines — линейные объекты;
- districts — полигональные объекты.

## Соответствие geometry.type и targetLayer

- Point или MultiPoint → points;
- LineString или MultiLineString → lines;
- Polygon или MultiPolygon → districts.

## Будущая CAPTCHA-проверка

На первом этапе CAPTCHA выключена. Но frontend всё равно может отправлять поле captchaToken, а backend должен иметь отдельную функцию проверки:

```js
async function verifyCaptcha(captchaToken, requestIp) {
  if (process.env.CAPTCHA_ENABLED !== "true") {
    return true;
  }

  // Здесь позже появится проверка CAPTCHA-сервиса.
}
```

## Что backend должен создать в Pull Request

Минимально:

- файл заявки в submissions/pending;
- изменённый GeoJSON-файл в public/data, если backend уже умеет применять изменения автоматически.

Пример файлов в PR:

```text
submissions/pending/sub_2026-05-16_001.json
public/data/points.geojson
```
