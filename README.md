# VNA sprite demo (2D) — Codespaces

## Avvio
In Codespaces:
```bash
python3 server.py
```

Poi vai nella tab **Ports**:
- porta **8080**
- metti **Visibility: Public**
- apri l’URL (tipo `https://<id>-8080.app.github.dev`)

## Endpoint richiesto
- **POST /setMissione**
  - JSON: `{"scaffale":4,"posto":12,"livello":1,"missione":2}`
  - oppure stringa: `"4-12-1-2"`

Esempio (da terminale Codespaces):
```bash
curl -X POST "http://localhost:8080/setMissione" -H "Content-Type: text/plain" -d "4-12-1-2"
```

Da fuori (usando l’URL pubblico della porta 8080):
```bash
curl -X POST "https://<id>-8080.app.github.dev/setMissione" -H "Content-Type: text/plain" -d "4-12-1-2"
```

## Fallback
Se WS non funziona, la pagina usa:
- **GET /checkMissione** (polling)

## Note
- Carrello rallentato di **1,5x**
- Pre-stoccaggi in testata: 1 per corsia, solo livello 1 (per ora solo disegnati)


## Simulatore missioni in pagina
C'è una sezione **Simulatore missioni** che invia direttamente `POST /setMissione` (utile su mobile senza cURL).
