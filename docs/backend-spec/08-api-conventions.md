# API Conventions

## Success
{
  "ok": true,
  "data": {}
}

## Error
{
  "ok": false,
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable message",
    "details": {}
  }
}

## Rules
- Use stable machine-readable error codes.
- Use correct HTTP status codes.
- Use ISO 8601 UTC timestamps.
- Use a single ID strategy consistently.

## Pagination
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0,
  "hasMore": false
}
