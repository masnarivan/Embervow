# Embervow

Action RPG nel browser: combattimento souls-like (stamina, schivata, boss a fasi) in vista isometrica,
con scelte morali che aprono la via della Luce o dell'Oscurità.

## Il mondo

Una discesa negli Inferi. Satana ha rubato il vaso di Pandora, con dentro l'ultima cosa rimasta: la speranza.
I nemici sono demoni; si scende di area in area fino a sconfiggere Satana e riprendersi il vaso.

## Regole di progressione (decise)

- **Bivio dei talenti definitivo.** Il primo talento imparato sceglie la via (Paladino o Berserker) e preclude
  l'altra. Non esiste un percorso neutro o ibrido.
- **Respec solo quasi a fine gioco.** Serve un oggetto chiave, l'Acqua del Lete (`RESPEC_ITEM` in
  `src/data/items.ts`), e si usa riposando a un falò. Non è ancora piazzato in nessuna area.
- **I livelli salgono da soli.** Gli XP non si spendono al falò: raggiunta la soglia si sale subito.

Phaser 3 + TypeScript + Vite.

```bash
npm install
npm run dev     # gioco su http://localhost:5173
npm test        # test della logica (Vitest)
```
