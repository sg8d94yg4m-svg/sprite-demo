# VNA sprite demo (2D)

Apri `index.html` in un browser.

## Doppia cross-aisle (implementato)
- **Cross-aisle in testata (alta)**: sopra il posto 1
- **Cross-aisle bassa**: sotto il posto 20

### Regola di scelta cross-aisle (come richiesto)
- Se il target è **sopra la metà** (posti 1–10) → usa **asse bassa**
- Se il target è **sotto la metà** (posti 11–20) → usa **asse in testata**

## Mapping corridoi ↔ scaffali
- Corridoio 1 → Scaffale 1 (SX) e 2 (DX)
- Corridoio 2 → Scaffale 3 (SX) e 4 (DX)
- ...
- Corridoio 6 → Scaffale 11 (SX) e 12 (DX)

Lo **Scaffale** determina automaticamente:
- Corridoio = ceil(Scaffale/2)
- Lato = dispari→SX, pari→DX

## Assets
- `assets/truck_base.png` : sprite top-down del carrello.
- `assets/fork.png` : sprite forche (overlay) ruotabile DX/SX.
