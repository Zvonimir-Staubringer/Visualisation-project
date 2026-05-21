# Vizualizacija stanovništva Hrvatske

Projekt prikazuje interaktivni kartogram Hrvatske po županijama koristeći `SVG` i `D3.js`.

## Pokretanje

Otvori [index.html](./index.html) u pregledniku. D3 i podaci su spremljeni lokalno u projektu pa nije potreban internet.

## Sadržaj

- `index.html` - struktura aplikacije
- `styles.css` - izgled i animacije
- `app.js` - D3 logika, interakcije i grafovi
- `data/population-data.js` - lokalni JS zapis podataka za direktno učitavanje
- `data/population-data.json` - isti podaci u JSON formatu
- `data/croatia-counties-topology.js` - lokalni JS zapis topologije županija za preciznu kartu
- `scripts/extract_population_data.py` - skripta koja iz Excela generira podatke za frontend
- `scripts/build_topology_asset.py` - skripta koja iz Topology datoteke generira lokalni JS asset za kartu

## Regeneracija podataka

Ako se promijeni Excel datoteka, u korijenu projekta pokreni:

```powershell
python scripts/extract_population_data.py
```

Time se ponovno stvaraju `data/population-data.json` i `data/population-data.js`.

Za ponovno stvaranje lokalnog asseta karte pokreni:

```powershell
python scripts/build_topology_asset.py
```
