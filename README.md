# VNA sprite demo (2D) + Missioni via REST/WS

## Avvio (consigliato anche per iPhone)
Avvia il server:
```bash
python3 server.py
```

Apri:
- PC: http://localhost:8080/
- iPhone (stessa Wi‑Fi): http://IP_DEL_PC:8080/

## Missioni (per ora: passivo)
Formato: scaffale-posto-livello-missione (missione 1..3)
- 1 prelievo bancale
- 2 deposito bancale (futuro: solo se il carrello ha già un bancale)
- 3 picking (futuro: affiancamento cabina con offset in base al verso di entrata)

### Invia via REST
JSON:
```bash
curl -X POST http://localhost:8080/mission -H "Content-Type: application/json" \
  -d '{"scaffale":4,"posto":12,"livello":1,"missione":2}'
```
Stringa:
```bash
curl -X POST http://localhost:8080/mission -H "Content-Type: text/plain" -d "4-12-1-2"
```

## Note
- Carrello rallentato di 1,5x.
- Pre-stoccaggi in testata: 1 per corsia, solo livello 1 (a terra), per ora solo disegnati.
