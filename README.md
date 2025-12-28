# VNA sprite demo (2D)

Apri `index.html` in un browser.

## Cambi richiesti (implementati)
### Movimento
- Se il carrello deve cambiare corridoio, **esce dalla corsia**, percorre una **zona esterna (cross-aisle)** e rientra nel corridoio target.
- Se rimane nello stesso corridoio, si muove direttamente lungo il corridoio.

### Mapping corridoi ↔ scaffali
- Corridoio 1 → Scaffale 1 (SX) e 2 (DX)
- Corridoio 2 → Scaffale 3 (SX) e 4 (DX)
- ...
- Corridoio 6 → Scaffale 11 (SX) e 12 (DX)

Lo **Scaffale** determina automaticamente:
- Corridoio = ceil(Scaffale/2)
- Lato = dispari→SX, pari→DX

### UI
- Rimosso pulsante **Centro** delle forche: restano solo **Ruota SX** e **Ruota DX**.

## Assets
- `assets/truck_base.png` : sprite top-down del carrello (base).
- `assets/fork.png` : sprite forche (overlay) ruotabile DX/SX.
