# VNA sprite demo — 2,5D

Apri `index.html` in un browser.

## Cosa cambia rispetto alla 2D
- Scaffali estrusi in **2,5D**: blocchi con altezza e **5 livelli** (tacche).
- Il **livello target** viene evidenziato sullo scaffale target.
- Il carrello resta sprite 2D (top-down), ma ha un indicatore 2,5D di **alzata**.

## Doppia cross-aisle
- **Testata (alta)** + **Bassa**.
- Regola: target **posti 1–10 → bassa**, target **posti 11–20 → testata**.

## Mapping corridoi ↔ scaffali
- C1 -> S1 (SX) / S2 (DX) … C6 -> S11 (SX) / S12 (DX)
- Scaffale dispari=SX, pari=DX.
